import Groq from 'groq-sdk';
import dotenv from 'dotenv';
import path from 'path';

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const apiKey = process.env.GROQ_API_KEY;

if (!apiKey) {
    throw new Error(
        'CRITICAL: GROQ_API_KEY is not defined in the root .env file. Please add it before running the server.'
    );
}

// Initialize official Groq client
export const groqClient = new Groq({ apiKey });

// Default free-tier model configuration
export const DEFAULT_MODEL = 'openai/gpt-oss-120b';