import { handleGoogleRoute } from "../../server/google-route.js";
export const config = { runtime: "nodejs" };
export default (req, res) => handleGoogleRoute("status", req, res);
