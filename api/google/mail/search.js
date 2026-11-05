import { handleGoogleRoute } from "../../../server/google-route.js";
export const config = { runtime: "nodejs" };
export default (req, res) => handleGoogleRoute("mail/search", req, res);
