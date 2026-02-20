import { NextRequest, NextResponse } from "next/server";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import fs from "fs";
import path from "path";
import { CLAUSE_LIBRARY } from "@/lib/clause-library";

/**
 * Clean split XML tokens in .docx
 * Word splits {{token_name}} across multiple XML runs due to spell-check,
 * formatting changes, etc. This merges them back into clean {{token}} tags
 * so docxtemplater can find them.
 */
function cleanSplitTokens(xml: string): string {
  // Match {{ followed by any XML tags/content, then a token name, then any XML, then }}
  // This regex finds patterns where {{ and }} are in separate <w:t> elements
  // with XML noise (proofErr, formatting runs) in between
  const splitPattern = new RegExp("\\{\\{(<\\/w:t>[\\s\\S]*?<w:t[^>]*>)([a-z_]+)(<\\/w:t>[\\s\\S]*?<w:t[^>]*>)\\}\\}", "g");

  let cleaned = xml;

  // Keep replacing until no more matches (handles nested cases)
  let prev = "";
  while (prev !== cleaned) {
    prev = cleaned;
    cleaned = cleaned.replace(splitPattern, "{{$2}}");
  }

  // Also handle the case where just the opening {{ or closing }} is split
  // Pattern: {{</w:t></w:r>...<w:r>...<w:t>token_name</w:t></w:r>...<w:r>...<w:t>}}
  const broadPattern = new RegExp("\\{\\{<\\/w:t><\\/w:r>[\\s\\S]*?<w:t[^>]*>([a-z_]+)<\\/w:t><\\/w:r>[\\s\\S]*?<w:t[^>]*>\\}\\}", "g");
  prev = "";
  while (prev !== cleaned) {
    prev = cleaned;
    cleaned = cleaned.replace(broadPattern, "{{$1}}");
  }

  return cleaned;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { docType, variables, clauses } = body;

    if (!docType || !variables) {
      return NextResponse.json(
        { error: "Missing docType or variables" },
        { status: 400 }
      );
    }

    // Map doc type to template file
    const templateMap: Record<string, string> = {
      loi_building: "loi-building-tokenized.docx",
    };

    const templateFileName = templateMap[docType];
    if (!templateFileName) {
      return NextResponse.json(
        { error: `No template found for doc type: ${docType}` },
        { status: 400 }
      );
    }

    // Load the template file
    const templatePath = path.join(
      process.cwd(),
      "src",
      "templates",
      "tokenized",
      templateFileName
    );

    if (!fs.existsSync(templatePath)) {
      return NextResponse.json(
        { error: "Template file not found on server" },
        { status: 500 }
      );
    }

    const templateContent = fs.readFileSync(templatePath);
    const zip = new PizZip(templateContent);

    // Pre-clean the document XML to fix split tokens
    const xmlFiles = ["word/document.xml", "word/header1.xml", "word/header2.xml", "word/footer1.xml", "word/footer2.xml"];
    for (const xmlFile of xmlFiles) {
      const file = zip.file(xmlFile);
      if (file) {
        const rawXml = file.asText();
        const cleanedXml = cleanSplitTokens(rawXml);
        zip.file(xmlFile, cleanedXml);
      }
    }

    // Configure docxtemplater with custom delimiters matching our {{token}} format
    const doc = new Docxtemplater(zip, {
      delimiters: { start: "{{", end: "}}" },
      paragraphLoop: true,
      linebreaks: true,
      // Don't throw on missing tags — replace with empty string
      nullGetter: () => "",
    });

    // Build the data object for token replacement
    const data: Record<string, string> = { ...variables };

    // Handle clause insertion markers
    if (clauses && Array.isArray(clauses)) {
      const includedClauses = clauses.filter(
        (c: { included: boolean }) => c.included
      );

      // Clear closing extension marker (template uses the individual tokens directly)
      data.clause_insert_closing_extension = "";

      // For optional clauses — insert into optional markers
      const optionalClauses = includedClauses.filter(
        (c: { id: string }) => c.id !== "closing_extension"
      );

      optionalClauses.forEach(
        (clause: { id: string; variables: Record<string, string>; customText?: string }, index: number) => {
          const clauseDef = CLAUSE_LIBRARY.find((c) => c.id === clause.id);
          let clauseText = "";

          if (clause.customText) {
            clauseText = clause.customText;
          } else if (clauseDef) {
            clauseText = clauseDef.template;
            for (const [varToken, varValue] of Object.entries(clause.variables || {})) {
              clauseText = clauseText.replace(
                new RegExp(`\\{\\{${varToken}\\}\\}`, "g"),
                varValue
              );
            }
          }

          const markerKey = `clause_insert_optional_${index + 1}`;
          data[markerKey] = clauseText;
        }
      );

      // Clear any remaining optional markers
      for (let i = 1; i <= 5; i++) {
        const key = `clause_insert_optional_${i}`;
        if (!data[key]) {
          data[key] = "";
        }
      }
    }

    // Render the document
    doc.render(data);

    // Generate the output
    const output = doc.getZip().generate({
      type: "uint8array",
      compression: "DEFLATE",
    });

    return new NextResponse(Buffer.from(output) as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${docType}_document.docx"`,
      },
    });
  } catch (error) {
    console.error("Generation error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Document generation failed",
      },
      { status: 500 }
    );
  }
}
