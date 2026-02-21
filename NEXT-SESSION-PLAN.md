# CRE8 Docs — Remaining Changes (Next Session)

## Status: Phase 1 LOI Building — 90% Complete

End-to-end flow works: login → describe deal → AI extraction → review → generate .docx → save to SharePoint → open in Word. The items below are fixes and polish needed before handoff.

---

## Priority 1: Must Fix

### 1. Red Text in Generated Document
- **Problem:** 12 instances of red-colored text in the generated .docx. The tokenized template (`loi-building-tokenized.docx`) has tokens formatted with red font color so they stand out during editing. When docxtemplater replaces the tokens, the replacement text inherits the red formatting.
- **Affected tokens:** `property_address`, `parcel_number`, `seller_entity`, `buyer_entity`, `purchase_price`, `earnest_money_written`, `title_company`, `title_agent`, `psa_draft_days_written`, `commission_pct`, `cre8_agent_email`, `cre8_agent_phone`
- **Fix:** Write a post-processing step in `generate/route.ts` that strips red color (`<w:color w:val="FF0000"/>` or similar) from the document XML after docxtemplater renders. OR re-tokenize the template with all-black formatting (preferred — one-time fix).
- **Approach:** Open the .docx XML, find all `<w:color>` elements with red values near replaced tokens, remove them. This is a template-level fix, not a code-level one — re-save the template with black-formatted tokens.

### 2. Push Latest Commit
- **What:** Commit `2d81661` (fix duplicate number in written fields) needs to be pushed to GitHub via GitHub Desktop.
- **Action:** Kevin opens GitHub Desktop → clicks "Push origin"

---

## Priority 2: Polish

### 3. Purchase Price Format
- **Current:** Purchase price shows as raw number (e.g., "2500000")
- **Desired:** Should display as "$2,500,000" in review and in the document
- **Fix:** Add `numberField: true` handling for purchase_price, or apply `formatCurrency()` during extraction post-processing

### 4. Earnest Money Format
- **Current:** Earnest money may show as raw number
- **Desired:** Should display as "$50,000" in review field, written variant as "fifty thousand dollars"
- **Fix:** Same as purchase price — apply formatCurrency in extraction post-processing

### 5. Extension Deposit Format
- **Current:** Raw number
- **Desired:** Currency format with written variant
- **Fix:** Add `numberField: true, writtenVariant: "extension_deposit_written"` to variable map, add the written token to the template if needed

### 6. File Naming
- **Current:** `LOI_Building_[Address]_[Date].docx`
- **Consider:** Verify this matches the naming convention Kevin wants for SharePoint organization

---

## Priority 3: Future Enhancements

### 7. Error Handling Polish
- Better error messages when SharePoint upload fails
- Retry logic for Graph API token expiration mid-flow
- Graceful handling of missing CMS data (listings/teams endpoints down)

### 8. AI Extraction Tuning
- Test with more deal description variations
- Tune confidence thresholds based on real usage
- Consider adding more clause types to the library

### 9. Remaining Document Types
- LOI Land (similar to Building, different variable set)
- LOI Lease (different structure — rent terms, lease length)
- Listing Agreement — Sale
- Listing Agreement — Lease
- Each needs: tokenization → variable map → section config → AI prompt → template file

---

## Deployment Info

- **Vercel URL:** https://cre8-docs-9n1s.vercel.app
- **GitHub:** kjsx04/cre8-docs (public)
- **Azure App:** Client ID `c1bd941f-3240-412e-a22a-7c6296549c06`
- **Redirect URI:** `https://cre8-docs-9n1s.vercel.app` (added to Azure)
- **SharePoint path:** `/CRE8 Advisors/Documents/LOIs/Building/`
