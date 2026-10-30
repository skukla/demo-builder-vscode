/**
 * Clearing a demo's part of the store (datapack-engine step 10, owner 2026-10-30): the SC picks
 * STORES (store groups), and the wipe clears what those stores own and Demo Builder did not install,
 * closing their orders and returns. These are the shapes that cross between the extension, the
 * agent tools (`check_demo_data`, `clear_demo_data`) and the Data Installer webview.
 *
 * Shared between the extension and the webviews, so it imports nothing.
 *
 * @module types/demoDataWipe
 */

/**
 * One store to clear, by code. `storeCode` is the STORE's (store group's) code; left out, every
 * store of the website is meant (ticking a website ticks all its stores). Store views are never
 * named: nothing in Commerce belongs to a view except translations and where an order was placed.
 */
export interface WipeStoreChoice {
    websiteCode: string;
    storeCode?: string;
}

/** One store as the picker shows it: its views underneath, and why it cannot be ticked, if so. */
export interface WipeChoiceStore {
    code: string;
    name: string;
    /** Its store views' names, shown under the store, never picked. */
    views: string[];
    /** Part of what was asked about. */
    ticked: boolean;
    /** Another local project records this store as its own: the sentence naming it. Cannot be ticked. */
    claimedBy?: string;
}

/** One website and its stores, in the store's own order. */
export interface WipeChoiceWebsite {
    code: string;
    name: string;
    stores: WipeChoiceStore[];
}

/** Some things, counted, with at most three named. */
export interface WipeNamed {
    count: number;
    names: string[];
}

export type WipeKind = 'products' | 'categories' | 'customers' | 'orders' | 'cart rules';

/** Things of one kind the wipe leaves, and the one reason. */
export interface WipeLeft extends WipeNamed {
    kind: WipeKind;
    why: string;
}

/** A store the plan covers, by code and name. */
export interface WipePlanStore {
    websiteCode: string;
    websiteName: string;
    storeCode: string;
    storeName: string;
}

/**
 * The orders an ERP integration handles ("One action, ERP included", owner 2026-10-30): an ERP
 * integration serves the instance (from any local project) and sends the orders of some chosen
 * stores' websites to an ERP, so the wipe does not close those itself. It asks the integration to
 * close them, then refreshes the ERP from Commerce. Left open instead (`held`) when the integration
 * must be updated first, or could not be asked.
 */
export interface WipeErpPart {
    /** The project the integration is in, as the SC knows it: "JustRite". */
    integration: string;
    /** The chosen websites whose orders it sends to an ERP. */
    websites: string[];
    /** The open orders placed there, by number. */
    orders: WipeNamed;
    /** Why those orders are left this time; absent when the integration closes them. */
    held?: string;
    /** The one line the list shows for it. */
    line: string;
}

/** What the SC and the agent see before anything is written. Counts and a few names, never rows. */
export interface WipePreview {
    stores: WipePlanStore[];
    /** What would be deleted, by kind. A cart rule's coupons go with it (step 11). */
    remove: Record<'products' | 'categories' | 'customers' | 'cartRules', WipeNamed>;
    /** Products also sold on websites not chosen: taken off the chosen ones only. */
    takenOff: WipeNamed;
    /** Cart rules also used on websites not chosen: taken off the chosen ones only (step 11). */
    rulesTakenOff: WipeNamed;
    /**
     * Orders are never deleted (Commerce cannot): canceled, refunded with a credit memo, or left open
     * with a note when Commerce can do neither; their returns closed. Named by order number.
     */
    orders: { cancel: WipeNamed; refund: WipeNamed; leftOpen: WipeNamed; returns: WipeNamed };
    /** Orders an ERP integration handles, when one serves some chosen stores' websites: not in `orders`. */
    erp?: WipeErpPart;
    left: WipeLeft[];
    /** What the install records list (every local project's, on the chosen websites), by kind: their packs' removal takes those. */
    installed: Record<string, number>;
    /** How many things the wipe would change. */
    total: number;
    /** Names this exact plan; the clearing must be handed it back. */
    token: string;
    /** What is never touched, in one sentence. */
    never: string;
}

/**
 * `check-demo-data`'s answer: every website and store to choose from, and, when stores were chosen,
 * either the list of what clearing them would do or why it may not be done from this project.
 */
export interface DemoDataCheck {
    choices: WipeChoiceWebsite[];
    preview?: WipePreview;
    /** A chosen store another local project records as its own: one sentence per store, naming it. */
    refused?: string;
}

/** What either handler is sent. Checked in the handler: an agent sends these too. */
export interface DemoDataRequest {
    /** The stores to look at or clear. The check defaults to the project's own store; the clearing never does. */
    stores?: WipeStoreChoice[];
    /** Clear only: the token of the list shown (`check-demo-data`'s answer). */
    token?: string;
    /** Clear only: must be true. */
    confirm?: boolean;
    /** Started from the Data Installer's button, so its progress goes to the screen's progress window. */
    progress?: 'modal';
}
