import type {
	AgentRequest,
	AgentResponse,
	AgentContext,
	JsonObject,
} from "@agentuity/sdk";
import { perplexity } from "@ai-sdk/perplexity";
import { generateText } from "ai";
import { weatherTool } from "../../lib/tools/weatherTool";

export default async function SanFranLocalGuideAgent(
	req: AgentRequest,
	resp: AgentResponse,
	ctx: AgentContext,
) {
	// Handle both plain text and JSON inputs
	let userPrompt: string;

	if (req.data.contentType === "text/plain" && req.data.text) {
		userPrompt = await req.data.text();
	} else if (req.data.contentType === "application/json" && req.data.json) {
		const jsonData = (await req.data.json()) as JsonObject;
		userPrompt = jsonData.prompt as string;
		if (!userPrompt) return resp.text("JSON must contain a 'prompt' property.");
	} else {
		return resp.text(
			"This agent accepts 'text/plain' or 'application/json' with a prompt field.",
		);
	}

	const prompt = await req.data.text();

	try {
		const result = await generateText({
			model: perplexity("sonar-pro"),
			system: `
				You are San Francisco Local Guide, an AI assistant specializing in San Francisco, California recommendations and information.
				
				Your expertise includes:
				- San Francisco-specific food and restaurant recommendations with local favorites
				- Entertainment options including museums, attractions, nightlife, and beaches
				- Transportation advice including public transit, ride-sharing, and navigation tips
				- Local cultural context, history, and San Francisco-specific tips
				- Seasonal events and activities
				- Providing current weather forecasts for San Francisco locations when asked.

				You only know about San Francisco, California.

				Always provide specific, actionable information tailored to San Francisco.
				When making recommendations, include neighborhood information and local context.
				Include relevant details like price ranges, accessibility, and cultural significance.
				If asked for the weather, use the provided tool to get the current forecast and 
				incorporate it naturally into your response. Do not just state the raw tool output, 
				explain it conversationally. For example, instead of just 'temperature: 75, unit: F, 
				forecast: Sunny', say 'The weather looks great right now! It's sunny and about 75 
				degrees Fahrenheit.'
			`,
			prompt: prompt,
			tools: {
				getWeather: weatherTool,
			},
			maxSteps: 5,
		});

		// make sure we include the sources in the footers
		const footnotes = result.sources
			.filter((source) => source.sourceType === "url")
			.map((source, index) => `[${index + 1}]: ${source.url}`)
			.join("\n");

		return resp.text(`${result.text}\n\n${footnotes}`);
	} catch (error) {
		// Use ctx.logger and ensure the error is logged properly
		ctx.logger.error(
			"Error generating response: %s",
			error instanceof Error ? error.message : String(error),
		);
		return resp.text(
			"I'm sorry, I encountered an error while processing your request. Please try again later.",
		);
	}
}
