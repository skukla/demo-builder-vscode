# What a real ERP's outbound events look like (AB-26y step 6)

Researched 2026-10-02 from vendor pages, for "the ERP should not speak Commerce's language".
Each claim names its source; pages that would not load are listed as such.

## Short answer

Real ERPs mostly send small NOTICES: the document's key plus a few classifying fields, and the
receiver reads the rest from the ERP's API. SAP S/4HANA's business events and Business Central's
webhooks both work this way. Older SAP IDocs carry the data itself (full or changed segments).
Field-level old/new values live in a separate change log in both ERPs, not in the event; SAP's
status-change events are the one place a previous value travels in the event.

## SAP S/4HANA business events

- CloudEvents 1.0 envelope; type `sap.s4.beh.<object>.v1.<Object>.<Action>.v1`. SAP's example
  carries `data: {"BusinessPartner":"1000667"}` (https://developers.sap.com/tutorials/prepare-hub;
  https://cap.cloud.sap/docs/guides/events/s4). The tutorial separates "notification events"
  ("does not contain much data") from "data events".
- Outbound delivery (package CE_OUTBOUNDDELIVERYEVENTS, from a secondary copy of the api.sap.com
  spec: https://gist.github.com/195858/b6c24132d3fdb3a3a064a5c663d7e650): Created/Changed/Deleted
  carry `OutboundDelivery, DeliveryDocumentType, SalesOrganization, SDDocumentCategory`;
  `GIStatusChanged` adds `OverallGoodsMovementStatus, PrevOverallGoodsMovementStatus`. Goods
  issue shows up as that status change; there is no "GoodsIssuePosted" event.
- Sales order Created/Changed exist
  (https://learning.sap.com/courses/integrating-sap-entitlement-management/replicating-a-sales-order-using-event-mesh).
  Payload list seen only in a search snippet.
- Billing documents (invoices and credit memos alike) raise created/changed/canceled events with
  `BillingDocumentCategory` among the fields (help.sap.com release note, snippet only).

## SAP IDocs (older)

Master-data IDocs (MATMAS, DEBMAS) are built from change pointers and carry "all the IDoc
segments whose fields have changed" plus mandatory segments, sent complete
(https://help.sap.com/doc/saphelp_snc700_ehp01/7.0.1/en-US/0b/2a61ca507d11d18ee90000e8366fc2/content.htm).

## Business Central

- Webhook notice: `subscriptionId, clientState, expirationDateTime, resource, changeType
  (created|updated|deleted|collection), lastModifiedDateTime`; no entity data. About 30 s
  delayed and merged; a line change notifies the header
  (https://learn.microsoft.com/en-us/dynamics365/business-central/dev-itpro/api-reference/v2.0/dynamics-subscriptions).
- Webhook entities include salesOrders, salesInvoices, salesCreditMemos, customers, items, but
  not salesShipments.
- Change Log: per table, old and new value per field
  (https://learn.microsoft.com/en-us/dynamics365/business-central/across-log-changes).

## Could not establish

Exact primary-source payload fields for SAP sales order, billing document, product, customer,
credit block and customer return events (api.sap.com and help.sap.com rendered blank,
community.sap.com answered 403); ORDERS/DESADV/INVOIC IDoc contents.
