# Release test plan — everything built since the last Demo Builder release

Written 2026-10-04 for the owner; updated 2026-10-05 with the category and product page work
(EDS-24, 26, 27, 28). Covers the work of the four overnight runs (2026-10-02 to 10-05), the day
runs, and the ERP fixes deployed 2026-10-04. Ordered the way an SC moves through
Demo Builder. Item ids are in brackets at the end of each line, for the record only.

**Time:** about 3 hours for everything; the ★ rows alone take about 1¼ hours and cover what
matters most.

## Before you start

1. **Use the release candidate.** `loop/2026-10-05-release-candidate` combines
   `loop/2026-10-04-day-a` (everything through the overnight runs, plus the 2026-10-05 page work)
   and `loop/2026-10-04-day-b` (cleanup). Run `npm run compile` in that tree and reload the Demo
   Builder window.
2. **Projects to use:**
   - **Justrite**, which has both ERPs set up fresh today: Justrite ERP owns 43 products, Accuform
     ERP owns 96, there are no orders yet, and today's cut-off-button fix is deployed.
   - **A scratch project** for anything that creates or deletes. Never use Justrite for those.
3. **Window size:** run the ERP tests with the browser at **1280 pixels wide**. That's where the
   cut-off buttons were.

## 1. Opening Demo Builder and the AI tools

| | Do this | Expect |
|---|---|---|
| ★ | Sidebar → Chat → **Pick an earlier chat** | Claude Code opens its own list of past chats in a new tab [AI-4b] |
| | On a machine (or user) without Claude Code, click **Open in Claude Code** | A message says it isn't installed, with a **How to install** button; the AI badge isn't green [AI-4a] |

## 2. Your Projects

| | Do this | Expect |
|---|---|---|
| ★ | Look at Your Projects in grid view and list view | No header "New" button. A dashed **New project** card is last; it opens New / Copy from existing / Import from file. It hides while you filter [PL-62] |
| ★ | **Export** Justrite | The file is named `justrite.project.demo-builder.json`. Open it: no passwords, keys or tokens anywhere [PL-56c] |
| ★ | **Import from file** using that export (into a new name) | It asks you to sign in to GitHub and DA.live like a new project does. It gets its own repository. Integrations, datapack, store setup and settings all come back [PL-56d] |
| | **Copy from existing** on Justrite | The wizard opens with Justrite's choices, datapack and store structure, no credentials, and a new repository [PL-56e] |
| | **Edit** a project | Its own values are kept, and the datapack and store structure are filled in [PL-56e] |
| | Delete the scratch copy | It's gone, and its stored secrets go with it [PL-64] |

## 3. Creating a project — storefront

| | Do this | Expect |
|---|---|---|
| ★ | Create a storefront on a GitHub repository the **AEM Code Sync** app isn't installed on | Setup pauses with the install dialog. Install the app; setup says it's verified and carries on, with no Retry [EDS-20, EDS-23] |
| | Create a new repository in the Storefront area | The new repository becomes the selected one; the Code Sync notice sits centred [EDS-18, EDS-19] |
| | Pick an **empty repository an organization made for you** | Setup writes a first commit, applies the template and finishes [EDS-17 — *built, not yet tried live*] |
| | Trigger a GitHub organization refusal (single sign-on not authorized, or an org that hasn't approved the app) | A plain message saying what to do, not "Access denied" [EDS-17] |
| ★ | **Add a demo** by link to a colleague's storefront (e.g. `sayurihanki/aistore`) | It shows "Built on Adobe's Commerce boilerplate …", warns if older than 6.0.0, and says whether you can read their DA.live site, and who must grant access if not [EDS-13, EDS-22] |
| | Zip or share a storefront that has a `.env` file in it | The `.env` file is never in the zip, the shared bundle or the sync [security fix] |

## 4. The project dashboard

| | Do this | Expect |
|---|---|---|
| | Look for the **AEM Assets** tile | It opens AEM Assets for this project [EDS-21] |
| ★ | Run the **Storefront Report** on a storefront forked from our template | It says what it's built on and which fixes fit. If the template has newer code, it offers to bring it in, and the default is No [EDS-13f] |
| | Run any long operation (deploy, reset) | The progress window says what it's doing at each stage, not just a spinner [PL-59] |

## 5. Category and product pages (Edge Delivery storefronts)

The category menu reads Commerce's category tree live; Demo Builder writes an editable page per
"Include in Menu" category and never touches a page someone else made or edited. Use a scratch
project from a shipped package unless the row says Justrite.

| | Do this | Expect |
|---|---|---|
| ★ | Create a storefront with **Demo Builder Blocks** ticked | The nav has the catalog menu. Each "Include in Menu" category has a page that lists its products. The summary names any category that already had a page [EDS-24 — *proven on Justrite, not yet at creation*] |
| | Before creating, hand-build a page for one category at another address (a product list block naming it) | No second page is written; the menu links to your page and the summary says so [EDS-24 — *not yet run live*] |
| | Edit one Demo Builder category page in DA.live, then **Republish** | Your edit survives [EDS-24] |
| | **Reset** the scratch project | The nav and the unedited category pages come back exactly; edited pages are left alone [EDS-24] |
| ★ | On an existing storefront without the library, tick **Demo Builder Blocks** in Configure, then **Check for updates** | One item, "Demo Builder Blocks: install". Applying it is one commit to the storefront repository [EDS-28 — *proven on Justrite*] |
| ★ | With the project open, add a category in Commerce Admin set to "Include in Menu" (wait a few minutes) | A notice names it and offers **Add pages** or **Always add for this project**. **Add pages** writes and publishes it [EDS-27 — *notice not yet seen live*] |
| | Turn on `demoBuilder.categoryPages.autoAdd` and add another category | Its page is added and published without asking, then a notice says what was added, with **Stop for this project** [EDS-27 — *not yet seen live*] |
| | Ask the agent "Are any categories missing pages? Add them." | It lists them, then asks before adding. It can't turn the automatic setting on [EDS-27 — *proven on Justrite*] |
| ★ | **Reset** a storefront that has published product pages | The result says how many product pages were removed, then the current catalog's pages come back and answer [EDS-26 — *proven on Justrite*] |
| | **Delete** the scratch project | Its product pages are removed from the live site too; DA.live content is not touched by this step [EDS-26 — *not yet run live*] |
| | Reset or delete a project whose storefront repository another project on this machine also uses | It refuses and names the other project [EDS-26] |
| | Command palette → **Manage DA.live Sites**, delete a throwaway site | The confirmation says its pages come off the live site. Afterwards its aem.live pages answer 404; if any couldn't be unpublished, the message names the site [EDS-31 — *not yet run live*] |

## 6. App Builder integrations (scratch project)

| | Do this | Expect |
|---|---|---|
| ★ | Integrations screen | No header Add button; a dashed **Add an integration** card is last, in card and list view [PL-62] |
| ★ | Add the blank starter app, name it, then use **Save to GitHub** on its card | It asks first (public repository, file count). One commit lands on GitHub, with no `.env`, `node_modules` or `dist`. Then **Delete its GitHub repository** undoes it, and the app is a starter again [AB-1c — *first real run*] |
| | Add any integration | It gets its own Adobe workspace, and no Stage workspace is created [AB-23, AB-24] |
| | Open an integration's **Settings** from its tile | Settings are edited there, not on Configure Project; saving redeploys [AB-21] |
| | **Update** an integration that has newer code | New code is deployed, then Commerce is brought up to it [AB-13] |
| | Read the integration's detail panel, then **Remove** it | The panel explains the optional App Management listing. Remove warns the listing stays until unassociated in Commerce Admin, and reports anything left behind [AB-11, AB-12, AB-33] |
| | (If you can) use a project where you aren't a developer on the Commerce product profile | A plain explanation of who can fix it, not a raw Adobe error [AB-18] |

## 7. The ERP pair (scratch project, or Justrite after a reset)

| | Do this | Expect |
|---|---|---|
| ★ | **Add the ERP integration** and type an ERP name | The first ERP is named what you typed. It can't be renamed later, by design [AB-16o, AB-67] |
| ★ | **Add another ERP** on its card | It asks for a name and which products it owns (by website, product attribute or warehouse) and gets an unused look. **Check the default ownership choice:** through the agent tool today it defaulted to "products sold on the base website" [AB-64, AB-51] |
| ★ | After the add, open each ERP | It's already filled from Commerce: its own products, companies, price groups and price lists. The integration's Admin page has each ERP's sales organizations filled in where nothing was set [AB-26y, AB-44] |
| | **Reset ERPs** | Orders are closed off, Commerce's credit limits and blocks are undone, both ERPs are wiped and refilled, and it doesn't stop at 60 seconds [AB-16n, AB-61, AB-47] |
| | In the ERP, open the **user menu → Appearance**, then **Settings** | Appearance has a live preview of theme, logo and navigation style; Settings is a form an ERP user edits [AB-59] |

## 8. Running the demo — order to cash, on Justrite

Use the walkthrough in `commerce-erp-integration/docs/walkthrough.md` ("One order, two ERPs").

| | Do this | Expect |
|---|---|---|
| ★ | Place one order with a Justrite product and an Accuform product (buyer: Northgate) | It splits: each ERP gets only its lines. The checkout check answers quickly [AB-16, AB-55] |
| ★ | In each ERP, confirm, ship and invoice its part | Commerce shows the shipments and invoices. Each ERP's on-hand stock drops by what it shipped [AB-26g, AB-63] |
| | Ship or invoice from **Commerce Admin** instead | The change reaches the right ERP [AB-26g] |
| | Order with a cart price rule | Each ERP line shows its discount, carried through the invoice, return and credit memo [AB-16l] |
| ★ | Post a payment in an ERP against the invoice | The invoice reads Paid, and the company's credit in Commerce comes back [AB-26s] |
| ★ | Create a return in Commerce Admin for both lines | Each ERP gets a return for its line; receiving it and posting a credit memo gives Commerce a credit memo for just those lines, and the return closes [AB-16e, AB-26r] |
| | **Repeat order** in the ERP | A new order with the same lines [AB-26r] |
| | Rename a product in the ERP twice within 20 seconds | The second edit sticks [AB-62] |
| ★ | At **1280 pixels wide**, go through Pricing, Sales Orders, an order with open lines, Customers and Settings | No button is cut off. Remove, Edit and Close are first in their rows. Settings is one column [today's fix] |
| | Drag a few column edges in any ERP grid | Text and number columns resize [grid audit] |
| | Follow the order's progress strip on an order with a return | All stages fit at 1280 with no sideways scroll [today's fix] |

## 9. Using an agent (in a project's Claude Code chat)

| | Ask the agent | Expect |
|---|---|---|
| ★ | "Edit the home page headline and publish it" | It asks before writing, and again before publishing [write_page] |
| | "Copy the Justrite project as justrite-copy" | A new project with no credentials [PL-56f] |
| | "Create a project for the Justrite website and store view" | The store scope is set, so the right products show [AI-11] |
| ★ | "Add the ERP integration; call the ERP Brand B ERP" (scratch project) | The first ERP is named Brand B ERP. The agent asks you for the name first, because it can't change later [AB-67] |
| | Give it a short catalog brief (scratch store) | It shows a plan before writing, works in a safe order, checks shoppers can see the result, and lists how to undo it [AI-10 — *first real run*] |
| | "Why did the last deploy fail?" | It reads Runtime activations, including the App Management installer's runs [AB-31, AB-32] |
| | "List this project's event setups and remove the unused one" | It lists them and asks before removing [AB-6] |

## Known gaps — don't report these as bugs

- One ERP heading ("Amount") is still cut at 1280 on an order line that has both a discount and
  quantity left to close. The button still shows. Fixing it needs a column removed (your call).
- **Guest prices on Justrite show $0.00.** Signed-in company buyers see prices; guests and the
  General group get none, while a request with no group gets list prices. Under investigation, not
  caused by the page work.
- An expired DA.live sign-in can read as "no publishable pages" on Republish, and as still signed
  in [EDS-29, EDS-30, filed].
- Optimizer support (PL-60) and app-only projects (AB-1b) are designs only.
- The card payment path (AB-26s card half) needs a card payment method on Justrite first.
- The real-VS-Code UI tests (PL-66) haven't been run: `npm run test:ui`.

## After testing

Tell me what failed, by section and row. A clean pass on the ★ rows is enough to cut the release.
