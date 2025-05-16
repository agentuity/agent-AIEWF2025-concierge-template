import type {
	AgentRequest,
	AgentResponse,
	AgentContext,
	AgentWelcomeResult,
	JsonObject,
} from "@agentuity/sdk";
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { UserIntentSchema, type ConversationRecord } from "../../lib/types";

const overallSystemPrompt = `
You are a San Francisco concierge / host helping developers navigate San Francisco, the AI Engineer World Fair 2025 conference, 
and developer related when it comes to building AI agents on top of Agentuity.
`;

export default async function ConciergeHost(
	req: AgentRequest,
	resp: AgentResponse,
	ctx: AgentContext,
) {
	// Handle both plain text and JSON inputs
	let userPrompt: string;
	console.log(req.data.contentType);

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

	// We'll use this to store the conversation history later.
	const conversation: ConversationRecord = {
		// Create a unique conversation ID by combining timestamp with a random number
		conversationId: `${Date.now()}_${Math.floor(Math.random() * 10000)}`,
		history: [],
	};

	// Get the past conversation from the KV store for context.
	const pastConversation = await ctx.kv.get(
		"concierge-history",
		"ai-engineer-world-fair-2025-dev-mode",
	);
	if (pastConversation.exists) {
		const pastConversationData = await pastConversation.data.object<string[]>();
		conversation.history = pastConversationData || [];
	}

	// Determine user's request and intent
	const userIntent = await generateObject({
		model: anthropic("claude-3-7-sonnet-20250219"),
		system: `${overallSystemPrompt} Apart from this, you serve as a central hub that routes user requests to the right available AI agents.
Your task is to determine the user's intent, tag anything relevant, determine the opposite of the user's intent (negative thinking)
to ensure we don't do that - so that we can handle the user's intent in a structured way), then select 
the right agent for the use case.
Take the user's prompt and break these down according to the desired schema indicated.
The things you can help with by delegating to the right agent types are:
- Anytying related to San Francisco, surrounding areas, food, etc. (assume if a user is asking about 
things like food, directions, etc. that they are looking for a local guide in San Francisco)
- The AI Engineer World Fair 2025 conference
- Developer related topics when it comes to building AI agents on top of Agentuity
`,
		schema: UserIntentSchema,
		prompt: userPrompt,
	});

	// Update our conversation record as we go.
	conversation.userIntent = {
		userPrompt,
		...userIntent.object,
	};

	// Routes request and intent to appropriate agent
	const agentType = conversation.userIntent?.agentType;
	let agentName: string | undefined;
	const message = `
		<USER_INTENT>
		Here is the user's intent in stringified JSON: ${JSON.stringify(conversation.userIntent)}
		</USER_INTENT>

		<HISTORY>
		For past context, here is the history of what the user has asked for. NOTE: only use this to 
		understand the user, things they care about, etc. Do not use the history to answer the user's question.
		Here is the history: ${conversation.history?.join("\n")}
		</HISTORY>
	`;
	let agentResponse: string | undefined;
	switch (agentType) {
		case "sanfrancisco": {
			agentName = "SanFranLocalGuide";
			break;
		}
		case "conference": {
			agentName = "ConferenceExpert";
			break;
		}
		case "agentuity": {
			agentName = "DeveloperExperience";
			break;
		}
	}

	ctx.logger.info(`Agent selected: ${agentName}`);

	if (agentName) {
		const agent = await ctx.getAgent({ name: agentName });
		const result = await agent.run({
			data: message,
			contentType: "text/plain",
		});
		agentResponse = await result.data.text();
	} else {
		agentResponse = `
			There wasn't a specific area I can help with in your request.  I can help with things 
			related to San Francisco, the AI Engineer World Fair 2025 conference, and developer related topics 
			when it comes to building AI agents on top of Agentuity.
		`;
	}

	const history = [userPrompt];
	if (conversation.history) {
		history.push(...conversation.history);
	}

	// In a prod app, you'd probably have an ID to identify the conversation.
	// For now, we're just using a static ID.
	await ctx.kv.set("concierge-history", "ai-engineer-world-fair-2025-dev-mode", history);

	return resp.text(agentResponse);
}

export const welcome = (): AgentWelcomeResult => {
	return {
		welcome: `# Welcome to the AI Engineer World Fair 2025 Concierge

How can I help you today?  I can help you with:

- San Francisco information
- AI Engineer World Fair 2025 information
- Getting started with Agentuity

For example:

> Where should I go for dinner in San Francisco, tonight?

> What sessions about AI are happening today?

> Tell me more about [Speaker Name]'s background

> I'm hungry and looking for Cuban food near the conference

> Help me plan my schedule for tomorrow based on my interests

> What is Agentuity all about?

> What's the weather in San Francisco today?`,
		prompts: [
			{
				data: "Where should I go for dinner in San Francisco, tonight?",
				contentType: "text/plain",
			},
			{
				data: "What sessions about AI are happening today?",
				contentType: "text/plain",
			},
			{
				data: "Tell me more about Dillon Mulroy's background",
				contentType: "text/plain",
			},
			{
				data: "I'm hungry and looking for Cuban food near the conference",
				contentType: "text/plain",
			},
			{
				data: "Help me plan my schedule for tomorrow based on my interests",
				contentType: "text/plain",
			},
			{
				data: "What is Agentuity all about?",
				contentType: "text/plain",
			},
			{
				data: "What can I do?",
				contentType: "text/plain",
			},
		],
	};
};
