import express from 'express';
import Groq from 'groq-sdk';

const aiRouter = express.Router();

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY, 
});

// Single endpoint for AI generation
aiRouter.post('/generate', async (req, res) => {
  try {
    const { prompt, maxTokens = 2048 } = req.body;

    if (!prompt) {
      return res.status(400).json({ success: false, error: 'Prompt required' });
    }

    if (!process.env.GROQ_API_KEY) {
      console.error('GROQ_API_KEY not found in environment variables');
      return res.status(500).json({ 
        success: false, 
        error: 'AI service not configured' 
      });
    }

    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: 'You are an expert educational content creator. Generate high-quality, structured educational content in markdown. When asked for JSON, return ONLY valid JSON without markdown code blocks.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      model: 'llama-3.3-70b-versatile', // Updated to supported model
      temperature: 0.7,
      max_tokens: maxTokens,
    });

    const content = completion.choices[0]?.message?.content;

    if (!content) {
      return res.status(500).json({ 
        success: false, 
        error: 'No content generated' 
      });
    }

    return res.json({ success: true, data: content });
  } catch (error: any) {
    console.error('Groq Error Details:', {
      message: error.message,
      status: error.status,
      response: error.response?.data
    });
    
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'AI generation failed'
    });
  }
});

export default aiRouter;