# Equity Trends Valuations Inc. (ETVI) website

A static, multi-page website for Equity Trends Valuations Inc. It is plain HTML, CSS and JavaScript, with no build step and no dependencies, so it can be hosted anywhere.

## Pages

| File | Content |
| --- | --- |
| `index.html` | Home: hero, welcome, services overview, why ETVI, valuation process, quotes |
| `about.html` | About the firm, principal (Douglas Craig, CA·CBV), key benefits, the business valuation profession |
| `services.html` | Business Valuations, Financial Consulting, Litigation Support, Family Law Matters, Affiliated Services |
| `information.html` | Upcoming events, publications, past seminars, links of interest, FAQs |
| `contact.html` | Contact details, enquiry form, map |
| `legal.html` | Legal notice and privacy policy |
| `404.html` | "Page not found" page |

## Preview locally

Open `index.html` in a browser, or serve the folder:

```bash
cd etvi-website
python3 -m http.server 8000   # then visit http://localhost:8000
```

## Publish

Upload the **contents** of this folder to any static host, for example:

- **Netlify:** drag and drop the folder at app.netlify.com/drop, then connect your domain.
- **GitHub Pages, Cloudflare Pages or Vercel:** point the site at this folder.
- **Your existing web host:** upload the files to the site root with FTP or the host's file manager.

Webflow cannot import a hand-coded site. To stay on Webflow, use these pages as the design reference and rebuild them there. Otherwise, host these files elsewhere and point your domain at them.

## Contact form

The form works out of the box. With no form service configured, it validates the visitor's input and opens their email app with the message already addressed to `doug.craig@equitytrends.ca`.

To have messages sent directly, without the visitor's email app:

1. Create a free form at a service such as [Formspree](https://formspree.io) (it gives you a URL like `https://formspree.io/f/abcdwxyz`).
2. In `contact.html`, find `data-endpoint=""` on the `<form>` tag and paste the URL between the quotes.

The form then posts in the background and shows a confirmation message. A hidden spam trap (`_gotcha`) is already included.

Visitors can also land on the form with a service or subject pre-selected, for example:
`contact.html?service=valuations#enquiry` or `contact.html?subject=Article%20request#enquiry`.

## Editing content

Each page is a complete HTML file. Edit the text directly in the relevant file. The header and footer are repeated in every page, so a change to either (for example a new phone number) must be made in all seven files. A find-and-replace across the folder does this quickly.

Styles live in `assets/css/styles.css`. Colours and fonts are defined as variables at the top of that file. Behaviour (menu, animations, FAQ, quote slider, contact form) lives in `assets/js/main.js`.

## Before going live: please review

- **Privacy policy** (`legal.html#privacy`): the source documents linked to a privacy policy but did not include one, so a general draft based on PIPEDA was written. Have it reviewed before publishing.
- **Dated items** on the Resources page: the "Spring 2010 newsletter is due for publication soon" notice, the 2009 IFRS article and the 2010 seminar. The article and seminar now link to the enquiry form ("Request the article", "Request seminar materials"). If you have the PDFs, add them to the folder and link to them instead.
- **Professional body names:** links of interest use the current websites (the CICBV is now the CBV Institute, the CICA is now CPA Canada, the ICAO is now CPA Ontario, and SEDAR is now SEDAR+). The page text keeps "CICBV" and "CA" as supplied; update the wording or credentials if you prefer the current names.
- **Photo:** the principal is shown with a "DC" monogram. To use a headshot, replace the `.monogram` elements with an `<img>`.
- **Domain:** once the domain is known, change `og:image` in each page's `<head>` to the full address (for example `https://www.example.ca/assets/img/og-image.png`) so link previews show the image. You can also add a `sitemap.xml`.
- **404 page:** most hosts serve `404.html` automatically. Its links are relative, so it displays correctly for missing pages at the top level of the site.

## Structure

```
etvi-website/
├── index.html, about.html, services.html, information.html,
│   contact.html, legal.html, 404.html
├── robots.txt
└── assets/
    ├── css/styles.css
    ├── js/main.js
    ├── img/        favicon.svg, apple-touch-icon.png, og-image.png
    └── fonts/      Inter and Instrument Serif (self-hosted, SIL Open Font License)
```

The site uses no tracking or advertising cookies, and loads no third-party scripts. The only third-party content is the embedded Google Map on the contact page.
