# Source inventory

Source archive: `sms.whiteinfobd.com.zip`

The Laravel source contains 71 migrations and the SMS domain includes users, senders, batches, messages, campaigns, contacts/groups, gateways, operators, tariff plans/rates/history, routing plans/rules, gateway operator costs, billing/deposits/transactions, API access tokens, IP whitelist records, KYC records, payment webhooks, imports/exports, templates and SP/reseller-related records.

The new runtime keeps these domain concepts where required by existing workflows. Provider adapters are reduced to InfoZillion as requested.

Important InfoZillion behavior retained from the source driver: success code 9000; IPTSP/MNO endpoint families; transaction T/P; Unicode type 3; serverTxnId; DLR; wallet/carrier balance; numeric CLI normalization.
