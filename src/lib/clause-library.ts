// 6 clause definitions from the blueprint

export interface ClauseDef {
  id: string;
  label: string;
  triggers: string[];
  source: "logic" | "library";
  template: string;
  variables: { token: string; label: string; defaultValue?: string }[];
}

export const CLAUSE_LIBRARY: ClauseDef[] = [
  {
    id: "closing_extension",
    label: "Closing Extension",
    triggers: ["extension", "extend closing"],
    source: "logic",
    template:
      'Buyer shall have {{extension_count}} ({{extension_count}}) {{extension_days}}-day extension(s) for an additional {{extension_deposit}} earnest money deposit per extension.',
    variables: [
      { token: "extension_count", label: "Number of Extensions", defaultValue: "1" },
      { token: "extension_days", label: "Extension Days", defaultValue: "30" },
      { token: "extension_deposit", label: "Extension Deposit ($)" },
    ],
  },
  {
    id: "financing_contingency",
    label: "Subject to Financing",
    triggers: ["subject to financing", "financing contingency", "loan contingency"],
    source: "library",
    template:
      'Buyer\'s obligations hereunder are contingent upon Buyer obtaining a written loan commitment for financing in an amount not less than {{loan_amount}} on terms acceptable to Buyer in Buyer\'s sole discretion within {{financing_days}} days of the Effective Date (the "Financing Contingency Period"). If Buyer is unable to obtain such commitment within the Financing Contingency Period, Buyer may terminate this Agreement by written notice to Seller, whereupon the Earnest Money shall be returned to Buyer and neither party shall have any further obligation hereunder.',
    variables: [
      { token: "loan_amount", label: "Loan Amount ($)" },
      { token: "financing_days", label: "Financing Period (days)", defaultValue: "21" },
    ],
  },
  {
    id: "as_is_purchase",
    label: "As-Is Purchase",
    triggers: ["as-is", "as is", "no repairs", "current condition"],
    source: "library",
    template:
      'Buyer acknowledges that it is purchasing the Property in its existing "AS-IS, WHERE-IS" condition, with all faults, and without any representations or warranties of any kind from Seller regarding the condition of the Property, express or implied. Buyer represents that it is relying solely on its own inspection and investigation of the Property and not on any representation or warranty of Seller or its agents.',
    variables: [],
  },
  {
    id: "exchange_1031",
    label: "1031 Exchange",
    triggers: ["1031", "like-kind exchange", "tax deferred"],
    source: "library",
    template:
      "{{exchange_party}} reserves the right to assign its rights under this Agreement to a Qualified Intermediary in connection with {{exchange_party}}'s intent to effectuate a tax-deferred like-kind exchange under Section 1031 of the Internal Revenue Code. The other party agrees to cooperate with such exchange, provided that: (i) the cooperating party shall not be required to take title to any exchange property; (ii) the cooperating party shall not incur any additional costs, liabilities, or obligations as a result of such exchange; and (iii) the closing shall not be delayed as a result of such exchange.",
    variables: [
      { token: "exchange_party", label: "Exchange Party (Buyer or Seller)", defaultValue: "Buyer" },
    ],
  },
  {
    id: "right_of_first_refusal",
    label: "Right of First Refusal",
    triggers: ["right of first refusal", "ROFR", "first right"],
    source: "library",
    template:
      "In the event Seller receives a bona fide written offer from a third party to purchase the Property, Seller shall promptly deliver written notice of such offer to Buyer. Buyer shall have {{rofr_days}} business days following receipt of such notice to elect, by written notice to Seller, to purchase the Property on the same terms and conditions as contained in the third-party offer. If Buyer fails to exercise this right within such period, Seller may proceed with the transaction with such third party on terms no more favorable than those offered to Buyer.",
    variables: [
      { token: "rofr_days", label: "ROFR Response Days", defaultValue: "5" },
    ],
  },
  {
    id: "seller_carryback",
    label: "Seller Carryback",
    triggers: ["seller carry", "seller carryback", "seller financing", "seller note"],
    source: "library",
    template:
      'A portion of the Purchase Price equal to {{carryback_amount}} ("Seller Carryback") shall be financed by Seller pursuant to a promissory note and deed of trust to be executed at Closing. The Seller Carryback shall bear interest at the rate of {{interest_rate}}% per annum, with monthly payments of principal and interest amortized over {{amortization_years}} years, with the entire remaining principal balance due and payable in full {{balloon_years}} years from the date of Closing. The specific terms of the promissory note and deed of trust shall be negotiated and agreed upon by the parties during the Due Diligence Period.',
    variables: [
      { token: "carryback_amount", label: "Carryback Amount ($)" },
      { token: "interest_rate", label: "Interest Rate (%)" },
      { token: "amortization_years", label: "Amortization (years)" },
      { token: "balloon_years", label: "Balloon Period (years)" },
    ],
  },
];

export function getClauseById(id: string): ClauseDef | undefined {
  return CLAUSE_LIBRARY.find((c) => c.id === id);
}
