// @ts-check
/**
 * One Vercel Connect connector serves every GitHub surface: the channel (webhooks, replies), the
 * `github` extension's tools, and the brokered git credential the station sandboxes clone, fetch,
 * and push with. Tokens are resolved lazily per use and never exposed to the model; the git
 * helpers inject them at the sandbox firewall, so they never enter a sandbox either.
 */
import { connectGitHubCredentials } from "@vercel/connect/eve";
import { envOr } from "../constants.js";

/** Connector UID for the factory's GitHub App installation. */
export const GITHUB_CONNECTOR = envOr("GITHUB_CONNECTOR", "github/solos-factory");

/** Connect-managed GitHub App credentials shared by the channel and the git helpers. */
export const githubCredentials = connectGitHubCredentials(GITHUB_CONNECTOR);
