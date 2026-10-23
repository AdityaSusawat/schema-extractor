/**
 * ============================================================================
 * @schema-extractor/api - Self-Healing & Impossible Date Stress Test
 * ============================================================================
 * Intentionally subjects the engine to:
 * 1. An impossible calendar date ("30th Feb, 2020")
 * 2. A strict regex code requirement that forces a format violation
 * 3. Nullability fallback verification
 */

import { runExtraction } from './extractor';
import { FieldDefinition } from '@schema-extractor/shared';

async function runSelfHealingStressTest() {
    console.log('===============================================================');
    console.log('  TESTING SELF-HEALING ENGINE: IMPOSSIBLE DATE & FORMAT REPAIR');
    console.log('===============================================================\n');

    // Schema with strict rules designed to catch LLM mistakes
    const testSchema: FieldDefinition[] = [
        {
            id: 'f1',
            name: 'vendorName',
            label: 'Vendor Name',
            type: 'string',
            description: 'Business or vendor name',
            required: true,
            allowNullIfMissing: false
        },
        {
            id: 'f2',
            name: 'invoiceDate',
            label: 'Invoice Date',
            type: 'date',
            description: 'The transaction date. Must be a valid real calendar date.',
            required: true,
            allowNullIfMissing: true, // If the text contains an invalid/impossible date, output null
            rules: { dateFormat: 'DD-MM-YYYY' }
        },
        {
            id: 'f3',
            name: 'invoiceCode',
            label: 'Invoice Code',
            type: 'string',
            description: 'The standardized invoice identifier code',
            required: true,
            allowNullIfMissing: false,
            rules: {
                regexPattern: '^INV-[0-9]{4}$',
                regexErrorMessage: 'Must strictly follow pattern INV-XXXX with 4 digits (e.g. INV-1024)'
            },
            examples: ['INV-2048']
        },
        {
            id: 'f4',
            name: 'totalAmount',
            label: 'Total Amount',
            type: 'number',
            description: 'Final invoice payable amount',
            required: true,
            allowNullIfMissing: false,
            rules: { min: 100, max: 50000, isInteger: true }
        }
    ];

    // Messy input text containing:
    // 1. "30th Feb, 2020" (Impossible calendar date!)
    // 2. "bill reference: 9912" (Missing the "INV-" prefix required by the regex)
    const messyInputText = `
    Payment voucher issued by Sharma Traders.
    Items purchased on 30th Feb, 2020.
    The total billed was 1,450 rupees.
    Internal bill reference: 9912.
  `;

    console.log('--- INPUT SOURCE TEXT ---');
    console.log(messyInputText.trim());
    console.log('\n--- TARGET RULES & TRAPS ---');
    console.log('1. Date Trap : "30th Feb, 2020" (2020 was a leap year, max 29 days in Feb)');
    console.log('2. Code Trap : Regex requires "^INV-[0-9]{4}$", but text says "bill reference: 9912"');
    console.log('\nInvoking runExtraction()...\n');

    const startTime = Date.now();
    const response = await runExtraction({
        rawText: messyInputText,
        schema: testSchema,
        maxRetries: 3
    });
    const elapsedMs = Date.now() - startTime;

    // --------------------------------------------------------------------------
    // PRINT THE RESULTS
    // --------------------------------------------------------------------------
    console.log('===============================================================');
    console.log(`  EXTRACTION FINISHED: ${response.success ? 'SUCCESS ✓' : 'PARTIAL / FAILED ✗'}`);
    console.log('===============================================================');
    console.log(`Total Attempts Taken : ${response.totalAttempts}`);
    console.log(`Total Duration       : ${response.totalDurationMs}ms (Wall Clock: ${elapsedMs}ms)`);
    console.log(`Total Tokens Spent   : ${response.totalTokensUsed}`);
    console.log(`Partial Success Flag : ${response.isPartialSuccess ? 'YES' : 'NO'}`);

    if (response.fatalError) {
        console.error(`\nFATAL ERROR: ${response.fatalError}`);
    }

    console.log('\n--- FINAL EXTRACTED JSON ---');
    console.log(JSON.stringify(response.data, null, 2));

    // --------------------------------------------------------------------------
    // PRINT THE SELF-HEALING ATTEMPT TIMELINE
    // --------------------------------------------------------------------------
    console.log('\n===============================================================');
    console.log('  SELF-HEALING TIMELINE (ATTEMPT-BY-ATTEMPT LOG)');
    console.log('===============================================================');

    response.repairLogs.forEach((log) => {
        console.log(`\n-------------------------------------------------------------`);
        console.log(`[ATTEMPT #${log.attemptNumber}] Status: ${log.success ? 'PASSED ✓' : 'FAILED ✗'} | Failure: ${log.failureType} | Time: ${log.durationMs}ms`);
        if (log.tokenUsage) {
            console.log(`Tokens Consumed: ${log.tokenUsage.totalTokens} (Prompt: ${log.tokenUsage.promptTokens}, Completion: ${log.tokenUsage.completionTokens})`);
        }

        if (!log.success) {
            console.log(`\nRaw Output Returned by LLM:`);
            console.log(log.rawLlmOutput);

            if (log.validationErrors && log.validationErrors.length > 0) {
                console.log(`\nViolations Caught by Zod Referee (${log.validationErrors.length}):`);
                log.validationErrors.forEach((err, idx) => {
                    console.log(`  ${idx + 1}. [${err.path}] ${err.message}`);
                    console.log(`     Received: ${JSON.stringify(err.receivedValue)}`);
                    if (err.expectedFormat) {
                        console.log(`     Expected: ${err.expectedFormat}`);
                    }
                });
            }

            if (log.repairPromptSent) {
                console.log(`\nSurgical Repair Prompt Sent for Next Turn:`);
                console.log(log.repairPromptSent.split('\n').map((line) => `  | ${line}`).join('\n'));
            }
        } else {
            console.log(`\nClean Validated Output:`);
            console.log(JSON.stringify(log.parsedJson, null, 2));
        }
    });

    console.log('\n===============================================================');
    console.log('  END OF TEST');
    console.log('===============================================================\n');
}

runSelfHealingStressTest().catch((err) => {
    console.error('Test script crashed:', err);
});