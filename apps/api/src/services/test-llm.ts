import { groqClient, DEFAULT_MODEL } from './llm';
import { buildSystemPrompt, sanitizeJsonResponse } from './prompter';
import { FieldDefinition } from '@schema-extractor/shared';

async function runTest() {
    console.log('--- Testing Groq Free Tier Inference ---');

    // 1. Define a dummy schema
    const sampleSchema: FieldDefinition[] = [
        {
            id: '1',
            name: 'vendorName',
            label: 'Vendor Name',
            type: 'string',
            description: 'The company or store that issued the bill',
            required: true,
            allowNullIfMissing: false
        },
        {
            id: '2',
            name: 'invoiceDate',
            label: 'Date',
            type: 'date',
            description: 'Date of purchase',
            required: true,
            allowNullIfMissing: false,
            rules: { dateFormat: 'DD-MM-YYYY' }
        },
        {
            id: '3',
            name: 'totalAmount',
            label: 'Total Amount',
            type: 'number',
            description: 'Final bill amount',
            required: true,
            allowNullIfMissing: false,
            rules: { currencyCode: 'INR' }
        }
    ];

    // 2. Sample messy text
    const messyText = `
    Hey, went to Sharma Sweets on 24th October 2026. 
    Bought 1kg kaju katli and some samosas. 
    Total came out to Rs 850 paid via UPI.
  `;

    // 3. Build prompt
    const systemPrompt = buildSystemPrompt(sampleSchema);

    console.log('Sending request to Groq...');
    const startTime = Date.now();

    const completion = await groqClient.chat.completions.create({
        model: DEFAULT_MODEL,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Extract data from this text:\n\n${messyText}` }
        ],
        temperature: 0.1, // Low temperature for deterministic output
        response_format: { type: 'json_object' }
    });

    const duration = Date.now() - startTime;
    const rawOutput = completion.choices[0]?.message?.content || '{}';
    const cleaned = sanitizeJsonResponse(rawOutput);

    console.log(`\nResponse received in ${duration}ms:`);
    console.log(JSON.stringify(JSON.parse(cleaned), null, 2));
    console.log(`\nTokens used:`, completion.usage);
    console.log('\n--- Test Successful! ---');
}

runTest().catch((err) => {
    console.error('Test failed with error:', err);
});