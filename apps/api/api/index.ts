// Vercel entry point: every /api/* and /health request is rewritten here (see vercel.json).
import { vercelHandler } from "@wvp/vercel";
import { createApp } from "../src/app";

export { config } from "@wvp/vercel";
export default vercelHandler(createApp());
