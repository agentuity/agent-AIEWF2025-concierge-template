import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * Downloads the latest conference llms.txt from https://www.ai.engineer and
 * augments it with a consolidated speaker list extracted from llms-full.txt.
 *
 * The combined file replaces the existing conference llms.txt in
 * `src/content/conference/llms.txt`.
 */
async function downloadConferenceDocs() {
	const llmsFullUrl = "https://www.ai.engineer/llms-full.txt";
	const targetPath = "./src/content/conference/llms.txt";

	try {
		console.log(`Downloading conference docs from ${llmsFullUrl} …`);
		const fullResp = await fetch(llmsFullUrl);

		if (!fullResp.ok) {
			throw new Error(`Failed to fetch llms-full.txt: ${fullResp.status} ${fullResp.statusText}`);
		}

		const llmsFullTxt = await fullResp.text();

		const finalContent = llmsFullTxt.trimEnd();
		// Ensure directory exists and write file.
		await mkdir(dirname(targetPath), { recursive: true });
		await writeFile(targetPath, finalContent, "utf8");

		console.log(`Successfully wrote updated conference docs to ${targetPath}`);
	} catch (error) {
		console.error("Error downloading conference docs:", error);
		process.exit(1);
	}
}

// Execute when run directly.
if (import.meta.main) {
	downloadConferenceDocs();
} 