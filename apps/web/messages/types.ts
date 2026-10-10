import type marketing from "./en/marketing.json";
import type shell from "./en/shell.json";
import type auth from "./en/auth.json";
import type feedback from "./en/feedback.json";
import type opportunities from "./en/opportunities.json";

/** The shape of a complete catalog: English is the source, every other language mirrors it key for key. */
export type Messages = typeof marketing & typeof shell & typeof auth & typeof feedback & typeof opportunities;
