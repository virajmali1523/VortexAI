const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 7377;
const DATA_DIR = path.join(__dirname, 'data');

// Middleware
app.use(cors());
app.use(express.json());

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// SDK Imports
const { GoogleGenerativeAI } = require('@google/generative-ai');
const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');

// --- Helper: Get API clients if configured ---
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenerativeAI(apiKey);
}

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new Anthropic({ apiKey });
}

// --- History API Endpoints ---

// Get all chat sessions (summarized list)
app.get('/api/history', (req, res) => {
  try {
    const files = fs.readdirSync(DATA_DIR);
    const sessions = [];

    files.forEach(file => {
      if (file.endsWith('.json')) {
        const filePath = path.join(DATA_DIR, file);
        try {
          const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          sessions.push({
            id: content.id,
            title: content.title || 'Untitled Chat',
            provider: content.provider || 'gemini',
            updatedAt: content.updatedAt || fs.statSync(filePath).mtimeMs
          });
        } catch (err) {
          console.error(`Error reading session file ${file}:`, err);
        }
      }
    });

    // Sort by updatedAt descending (newest first)
    sessions.sort((a, b) => b.updatedAt - a.updatedAt);
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve chat history.' });
  }
});

// Get a single chat session messages
app.get('/api/history/:id', (req, res) => {
  const sessionId = req.params.id;
  const filePath = path.join(DATA_DIR, `${sessionId}.json`);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Chat session not found.' });
  }

  try {
    const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    res.json(content);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read chat session.' });
  }
});

// Create/Update a chat session
app.post('/api/history', (req, res) => {
  const { id, title, messages, provider } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'Session ID is required.' });
  }

  const filePath = path.join(DATA_DIR, `${id}.json`);
  const sessionData = {
    id,
    title: title || 'Untitled Chat',
    provider: provider || 'gemini',
    messages: messages || [],
    updatedAt: Date.now()
  };

  try {
    fs.writeFileSync(filePath, JSON.stringify(sessionData, null, 2), 'utf-8');
    res.json(sessionData);
  } catch (error) {
    res.status(500).json({ error: 'Failed to save chat session.' });
  }
});

// Delete a chat session
app.delete('/api/history/:id', (req, res) => {
  const sessionId = req.params.id;
  const filePath = path.join(DATA_DIR, `${sessionId}.json`);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Chat session not found.' });
  }

  try {
    fs.unlinkSync(filePath);
    res.json({ success: true, message: 'Session deleted successfully.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete chat session.' });
  }
});

// Get suggested next topics/prompts based on the most recent chat session
app.get('/api/suggestions', async (req, res) => {
  const defaultSuggestions = [
    { label: 'Quicksort JS', prompt: 'Write a quicksort algorithm in JavaScript' },
    { label: 'CSS Glow Effect', prompt: 'Create a CSS code for glowing text effect' },
    { label: 'Explain SSE', prompt: 'Explain Server-Sent Events in 2 sentences' }
  ];

  let latestSession = null;

  try {
    const files = fs.readdirSync(DATA_DIR);
    const sessionFiles = [];

    files.forEach(file => {
      if (file.endsWith('.json')) {
        const filePath = path.join(DATA_DIR, file);
        try {
          const stat = fs.statSync(filePath);
          sessionFiles.push({
            name: file,
            filePath,
            mtimeMs: stat.mtimeMs
          });
        } catch (err) {
          console.error(`Error reading session file stats: ${file}`, err);
        }
      }
    });

    if (sessionFiles.length === 0) {
      return res.json(defaultSuggestions);
    }

    // Sort by modified time descending (most recent first)
    sessionFiles.sort((a, b) => b.mtimeMs - a.mtimeMs);
    const latestFile = sessionFiles[0].filePath;
    
    try {
      latestSession = JSON.parse(fs.readFileSync(latestFile, 'utf-8'));
    } catch (err) {
      console.error(`Error reading session content: ${latestFile}`, err);
      return res.json(defaultSuggestions);
    }

    const messages = latestSession.messages || [];
    if (messages.length === 0) {
      return res.json(defaultSuggestions);
    }

    // Use Gemini to generate suggestions if configured
    const genAI = getGeminiClient();
    if (!genAI) {
      // In demo mode, construct dynamic context-aware mock suggestions
      const title = latestSession.title || 'Last Chat';
      const mockSuggestions = [
        { label: `More on: ${title.length > 15 ? title.substring(0, 15) + '...' : title}`, prompt: `Tell me more details about "${title}"` },
        { label: 'Explain simply', prompt: `Can you explain the main points of our last conversation about "${title}" in very simple terms?` },
        { label: 'Next steps', prompt: `What are the practical next steps or applications for the concepts we discussed regarding "${title}"?` }
      ];
      return res.json(mockSuggestions);
    }

    const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-2.5-flash' });
    
    // Take last 6 messages for context
    const recentMessages = messages.slice(-6);
    const contextStr = recentMessages.map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`).join('\n');
    
    const prompt = `You are a helpful AI assistant.
Based on the following recent conversation with the user, generate exactly 3 short, relevant, and engaging next questions or prompt suggestions the user might want to ask.
Each suggestion must be highly relevant and helpful for continuing the conversation or exploring related topics.

Format the output strictly as a JSON array of 3 objects containing:
- 'label': A short, punchy button text (1-3 words, e.g. "Optimize Code", "Explain Closures", "Give examples").
- 'prompt': The detailed message/question that will be sent if they click the button.

Do not include any markdown formatting wrappers (like \`\`\`json or \`\`\`), code block tags, or extra text. Output only the raw JSON.

Here is the recent conversation:
${contextStr}
`;

    const result = await model.generateContent(prompt);
    let text = result.response.text().trim();
    
    // Clean up response text if Gemini returned markdown code block wrappers
    if (text.startsWith('```')) {
      text = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    }

    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return res.json(parsed.slice(0, 3));
      }
    } catch (parseErr) {
      console.error('Failed to parse Gemini suggestions JSON response:', text, parseErr);
    }
    
    throw new Error('Fallback to static dynamic suggestion generation');

  } catch (error) {
    console.error('Error generating suggestions (using fallback builder):', error);
    
    if (latestSession && latestSession.title) {
      const title = latestSession.title || 'Last Chat';
      const cleanTitle = title.replace(/\.\.\.$/, '').trim();
      const mockSuggestions = [
        { label: `More on: ${cleanTitle.length > 15 ? cleanTitle.substring(0, 15) + '...' : cleanTitle}`, prompt: `Can you tell me more about "${cleanTitle}"?` },
        { label: 'Explain simply', prompt: `Can you explain the key concepts of our last chat about "${cleanTitle}" in simple terms?` },
        { label: 'Next steps', prompt: `What are the practical applications or next steps for "${cleanTitle}"?` }
      ];
      return res.json(mockSuggestions);
    }
    
    res.json(defaultSuggestions);
  }
});

// --- SSE Streaming Response Mock for Demo Mode ---
function streamDemoResponse(prompt, res) {
  const responseText = `This is a streamed response from the **AI Chatbot Demo Mode**! 🚀

Since no API keys are currently configured in the backend \`.env\` file, the application falls back to this interactive sandbox mode. 

### What You Can Do
1. **Toggle Dark Mode**: Click the Sun/Moon icon in the top header.
2. **Select Providers**: Test the selector in the header to switch between *Gemini*, *OpenAI*, and *Claude*.
3. **Persist Chats**: Chats are saved automatically. Reload the page or create new ones from the left menu!
4. **Markdown Rendering**:
   - Check out code syntax highlighting:
     \`\`\`javascript
     // Quick math snippet
     function add(a, b) {
       return a + b;
     }
     console.log(add(5, 10)); // Output: 15
     \`\`\`
   - Markdown tables:
     | Feature | Demo Mode | Real API |
     | :--- | :---: | :---: |
     | Streaming | Yes (mock) | Yes |
     | History Saving | Yes | Yes |
     | Multi-Model Select | Yes | Yes |
     
Let me know if you would like me to help with anything else or if you want to paste your API keys in the backend \`.env\` file!`;

  const chunks = responseText.split(/(\s+)/); // split by whitespace keeping separators
  let index = 0;

  const interval = setInterval(() => {
    if (index >= chunks.length) {
      res.write('event: done\ndata: [DONE]\n\n');
      res.end();
      clearInterval(interval);
      return;
    }

    const chunk = chunks[index];
    res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
    index++;
  }, 40); // 40ms per chunk word/space for natural stream feel
}

// --- Streaming Chat Endpoint ---
app.post('/api/chat', async (req, res) => {
  const { messages, provider } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid messages array.' });
  }

  // Set SSE Headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders(); // Establish connection link immediately

  const lastUserMessage = messages[messages.length - 1]?.content || '';

  // Get active provider (locked to gemini)
  const activeProvider = 'gemini';

  try {
    if (activeProvider === 'gemini') {
      const genAI = getGeminiClient();
      if (!genAI) {
        res.write(`data: ${JSON.stringify({ text: `⚠️ **Gemini API Key is not set.** Add \`GEMINI_API_KEY\` to your backend \`.env\` file.\n\n` })}\n\n`);
        return streamDemoResponse(lastUserMessage, res);
      }

      const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-2.5-flash' });
      
      // Format history to match Gemini's contents parameter structure
      // Roles must be 'user' and 'model'
      const geminiHistory = messages.map(msg => {
        return {
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }]
        };
      });

      const chat = model.startChat({
        history: geminiHistory.slice(0, -1), // History excluding last user query
      });

      const result = await chat.sendMessageStream(lastUserMessage);

      for await (const chunk of result.stream) {
        const text = chunk.text();
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }

      res.write('event: done\ndata: [DONE]\n\n');
      res.end();

    } else if (activeProvider === 'openai') {
      const openai = getOpenAIClient();
      if (!openai) {
        res.write(`data: ${JSON.stringify({ text: `⚠️ **OpenAI API Key is not set.** Add \`OPENAI_API_KEY\` to your backend \`.env\` file.\n\n` })}\n\n`);
        return streamDemoResponse(lastUserMessage, res);
      }

      // Convert messages to openai schema
      const openAIMessages = messages.map(msg => ({
        role: msg.role === 'model' ? 'assistant' : msg.role,
        content: msg.content
      }));

      const stream = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: openAIMessages,
        stream: true,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          res.write(`data: ${JSON.stringify({ text: content })}\n\n`);
        }
      }

      res.write('event: done\ndata: [DONE]\n\n');
      res.end();

    } else if (activeProvider === 'claude') {
      const anthropic = getAnthropicClient();
      if (!anthropic) {
        res.write(`data: ${JSON.stringify({ text: `⚠️ **Anthropic (Claude) API Key is not set.** Add \`ANTHROPIC_API_KEY\` to your backend \`.env\` file.\n\n` })}\n\n`);
        return streamDemoResponse(lastUserMessage, res);
      }

      // Format messages: Claude needs strictly alternating user/assistant, starting with user.
      const anthropicMessages = messages
        .filter(msg => msg.role !== 'system') // Claude sets system prompt separately
        .map(msg => ({
          role: msg.role === 'model' ? 'assistant' : msg.role,
          content: msg.content
        }));

      // Find system instructions if any
      const systemMsg = messages.find(msg => msg.role === 'system')?.content || undefined;

      const stream = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 4096,
        system: systemMsg,
        messages: anthropicMessages,
        stream: true,
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta?.text) {
          res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
        }
      }

      res.write('event: done\ndata: [DONE]\n\n');
      res.end();

    } else {
      // Fallback
      streamDemoResponse(lastUserMessage, res);
    }
  } catch (error) {
    console.error('API Error during chat streaming:', error);
    res.write(`data: ${JSON.stringify({ error: `An error occurred with the ${activeProvider} provider: ${error.message}` })}\n\n`);
    res.write('event: done\ndata: [DONE]\n\n');
    res.end();
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`========================================`);
  console.log(`  AI CHATBOT BACKEND RUNNING ON PORT ${PORT}`);
  console.log(`  Local Address: http://localhost:${PORT}`);
  console.log(`========================================`);
});
