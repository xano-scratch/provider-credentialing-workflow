import { table, f } from "@xanots/sdk";

/** A healthcare provider being credentialed. NPI is the national identifier. */
export const providers = table({
  name: "providers",
  schema: {
    full_name: f.text({ required: true }),
    npi: f.text({ required: true }),
    specialty: f.text({ required: true }),
    active: f.bool({ required: true }),
  },
  index: [{ type: "unique", fields: [{ name: "npi" }] }],
});
