import { NextRequest, NextResponse } from "next/server";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import fs from "fs";
import path from "path";
import { CLAUSE_LIBRARY } from "@/lib/clause-library";

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
    // Template has markers like {{clause_insert_closing_extension}}, {{clause_insert_optional_1}}, etc.
    if (clauses && Array.isArray(clauses)) {
      // Process each clause
      const includedClauses = clauses.filter(
        (c: { included: boolean }) => c.included
      );

      // For the closing_extension clause (standard logic clause)
      const closingExt = includedClauses.find(
        (c: { id: string }) => c.id === "closing_extension"
      );
      if (closingExt) {
        // The closing extension variables are already in the main variables object
        // The template handles this via its own {{extension_count}} etc. tokens
        data.clause_insert_closing_extension = ""; // marker gets cleared, tokens handle the text
      } else {
        data.clause_insert_closing_extension = "";
      }

      // For optional clauses — insert into optional markers
      const optionalClauses = includedClauses.filter(
        (c: { id: string }) => c.id !== "closing_extension"
      );

      // Build clause text from library definitions
      optionalClauses.forEach(
        (clause: { id: string; variables: Record<string, string>; customText?: string }, index: number) => {
          const clauseDef = CLAUSE_LIBRARY.find((c) => c.id === clause.id);
          let clauseText = "";

          if (clause.customText) {
            clauseText = clause.customText;
          } else if (clauseDef) {
            // Replace clause-level variables in the template
            clauseText = clauseDef.template;
            for (const [varToken, varValue] of Object.entries(
              clause.variables || {}
            )) {
              clauseText = clauseText.replace(
                new RegExp(`\\{\\{${varToken}\\}\\}`, "g"),
                varValue
              );
            }
          }

          // Insert into optional markers
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

    // Generate the output as a Uint8Array
    const output = doc.getZip().generate({
      type: "uint8array",
      compression: "DEFLATE",
    });

    // Return the .docx file as binary
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
