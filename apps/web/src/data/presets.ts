/**
 * ============================================================================
 * @schema-extractor/web - Curated Document & Schema Test Presets
 * ============================================================================
 */

import { FieldDefinition } from '@schema-extractor/shared';

export interface PresetScenario {
    id: string;
    name: string;
    badge: string;
    description: string;
    rawText: string;
    schema: FieldDefinition[];
    expectedBehavior: string;
}

export const PRESETS: PresetScenario[] = [
    {
        id: 'rent-receipt',
        name: 'Rent Receipt',
        badge: 'Primitives & Nulls',
        description: 'Flat record extraction with calendar date parsing and nullable missing fields.',
        rawText: `Payment Receipt
Date of Transaction: 14-04-2026
Tenant: Mr. Vikram Malhotra
Property: Flat 402, Green Valley Apartments, Bangalore
Monthly Rent Amount: Rs. 32,500 only.
Payment Mode: NetBanking UPI (Ref: TXN-88419).
Owner remarks: None noted.`,
        schema: [
            {
                id: 'f_tenant',
                name: 'tenantName',
                label: 'Tenant Name',
                type: 'string',
                description: 'Full legal name of the tenant paying rent',
                required: true,
                allowNullIfMissing: false
            },
            {
                id: 'f_date',
                name: 'paymentDate',
                label: 'Payment Date',
                type: 'date',
                description: 'Date the rent was paid',
                required: true,
                allowNullIfMissing: false,
                rules: { dateFormat: 'DD-MM-YYYY' }
            },
            {
                id: 'f_amount',
                name: 'rentAmount',
                label: 'Rent Amount',
                type: 'number',
                description: 'Monthly rent amount in INR without currency symbols',
                required: true,
                allowNullIfMissing: false,
                rules: { min: 1000, max: 200000, isInteger: true }
            },
            {
                id: 'f_landlord',
                name: 'landlordName',
                label: 'Landlord Name',
                type: 'string',
                description: 'Legal owner of the property',
                required: false,
                allowNullIfMissing: true
            }
        ],
        expectedBehavior: 'Extracts 3 valid fields on Attempt #1 and outputs literal null for landlordName without hallucinating.'
    },
    {
        id: 'hardware-invoice',
        name: 'Line-Item Invoice',
        badge: 'Nested Arrays / Tables',
        description: 'Complex tabular data extraction mapping dynamic multi-row line items.',
        rawText: `Tax Invoice # INV-2026-8819
Supplier: TechZone Supplies Ltd., Nehru Place, New Delhi
Date: 10-09-2026
Order Items:
1. Wireless Optical Mouse - Qty: 2, Unit Rate: 650.00
2. Mechanical Gaming Keyboard - Qty: 1, Unit Rate: 3200.00
3. USB-C Braided Cable 2m - Qty: 3, Unit Rate: 299.00
Subtotal: 5397.00
Shipping Fee: 150.00
Grand Total Paid: 5547.00 via Corporate Card`,
        schema: [
            {
                id: 'f_supplier',
                name: 'supplierName',
                label: 'Supplier Name',
                type: 'string',
                description: 'Company issuing the invoice',
                required: true,
                allowNullIfMissing: false
            },
            {
                id: 'f_inv_date',
                name: 'invoiceDate',
                label: 'Invoice Date',
                type: 'date',
                description: 'Date of transaction',
                required: true,
                allowNullIfMissing: false,
                rules: { dateFormat: 'DD-MM-YYYY' }
            },
            {
                id: 'f_items',
                name: 'items',
                label: 'Line Items',
                type: 'array',
                description: 'List of individual purchased items',
                required: true,
                allowNullIfMissing: false,
                arrayItemType: 'object',
                children: [
                    {
                        id: 'c_desc',
                        name: 'description',
                        label: 'Item Description',
                        type: 'string',
                        description: 'Item name or description',
                        required: true,
                        allowNullIfMissing: false
                    },
                    {
                        id: 'c_qty',
                        name: 'quantity',
                        label: 'Quantity',
                        type: 'number',
                        description: 'Units purchased',
                        required: true,
                        allowNullIfMissing: false,
                        rules: { isInteger: true, min: 1 }
                    },
                    {
                        id: 'c_price',
                        name: 'unitPrice',
                        label: 'Unit Price',
                        type: 'number',
                        description: 'Price per individual unit',
                        required: true,
                        allowNullIfMissing: false
                    }
                ]
            },
            {
                id: 'f_total',
                name: 'grandTotal',
                label: 'Grand Total',
                type: 'number',
                description: 'Final bill amount inclusive of taxes and shipping',
                required: true,
                allowNullIfMissing: false
            }
        ],
        expectedBehavior: 'Produces a nested array of 3 object rows with mapped properties alongside root supplier and date fields.'
    },
    {
        id: 'self-healing-stress',
        name: 'Self-Healing Stress Test',
        badge: 'Triggers Repair Loop',
        description: 'Contains an impossible leap-year date (30th Feb) and a regex format trap to trigger live repair.',
        rawText: `Payment voucher issued by Sharma Traders.
Items purchased on 30th Feb, 2020.
The total billed was 1,450 rupees.
Internal bill reference: 9912.`,
        schema: [
            {
                id: 'f_vendor',
                name: 'vendorName',
                label: 'Vendor Name',
                type: 'string',
                description: 'Business or vendor name',
                required: true,
                allowNullIfMissing: false
            },
            {
                id: 'f_date_trap',
                name: 'invoiceDate',
                label: 'Invoice Date',
                type: 'date',
                description: 'Must be a valid real calendar date',
                required: true,
                allowNullIfMissing: true,
                rules: { dateFormat: 'DD-MM-YYYY' }
            },
            {
                id: 'f_code_trap',
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
                id: 'f_amount_trap',
                name: 'totalAmount',
                label: 'Total Amount',
                type: 'number',
                description: 'Final invoice payable amount',
                required: true,
                allowNullIfMissing: false,
                rules: { min: 100, max: 50000, isInteger: true }
            }
        ],
        expectedBehavior: 'Fails Attempt #1 on the regex and date bounds, triggers repair prompt, and passes on Attempt #2.'
    }
];