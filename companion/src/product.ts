export const PRODUCT_NAME = process.env.OMB_PRODUCT_NAME?.trim() || "FlowDesk";
/** Phone app name. Must not reuse OMB_COMPANION_NAME — that is this computer's label on the phone. */
export const COMPANION_NAME = process.env.OMB_PHONE_NAME?.trim() || PRODUCT_NAME;
