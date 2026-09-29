// places2go — Outreach templates (admin co-branding)
//
// Every template is generated from the place's real submissions: the review
// count and average from the store, the amenities users actually marked, and
// review text that moderation has cleared. A sentence is left out entirely when
// the data behind it does not exist (no reviews → no rating sentence). Nothing
// is estimated or invented. The admin can still edit the text before sending.

import { PARTNERSHIP_STATUS } from '../constants/cobranding';
import { joinList, formatDateLong } from './cobranding';

export const APP_NAME = 'places2go';

export const TEMPLATE_KEYS = {
  INTRO:              'intro',
  POSITIVE:           'positive_feedback',
  CONCERNS:           'concerns',
  FOLLOW_UP:          'follow_up',
  BANNER_CONFIRM:     'banner_confirm',
  NO_RESTROOM_INVITE: 'no_restroom_invite',
};

// ---------------------------------------------------------------------------
// Shared fragments
// ---------------------------------------------------------------------------
const greeting = ({ place, profile }) => {
  const contact = (profile?.business?.contactName || '').trim();
  return `Hello ${contact || `${place.name} team`},`;
};

const signature = ({ appSettings }) => {
  const name  = (appSettings?.cobrandingSenderName  || '').trim() || '[Your name]';
  const email = (appSettings?.cobrandingSenderEmail || '').trim();
  return [name, APP_NAME, email].filter(Boolean).join('\n');
};

const whoWeAre = () =>
  `${APP_NAME} is a community app that helps people find clean, accessible public restrooms nearby. Businesses that let the public use their restroom are listed on our map, and visitors rate and review them.`;

// Only produced when the place has reviews.
const ratingSentence = ({ place, insights }) => {
  if (!insights || insights.reviewCount === 0 || insights.averageRating === null) return null;
  const n = insights.reviewCount;
  return `${place.name} currently has ${n} review${n === 1 ? '' : 's'} on ${APP_NAME}, with an average rating of ${insights.averageRating.toFixed(1)} out of 5.`;
};

const amenitySentence = ({ insights }, max = 8) => {
  if (!insights || insights.confirmedAmenities.length === 0) return null;
  const list = insights.confirmedAmenities.slice(0, max);
  const more = insights.confirmedAmenities.length - list.length;
  return `Visitors have marked the following for your restroom: ${joinList(list)}${more > 0 ? `, and ${more} more` : ''}.`;
};

const quoteBlock = (excerpts = [], lead) => {
  if (!excerpts.length) return null;
  return [lead, ...excerpts.map((t) => `  • "${t}"`)].join('\n');
};

const bannerOffer = ({ appSettings }) => {
  const max = appSettings?.cobrandingMaxSuggestedItems;
  const itemsPhrase = Number.isInteger(max) && max > 0
    ? `up to ${max} item${max === 1 ? '' : 's'} of your choosing`
    : 'items of your choosing';
  return `We would like to offer you a partner banner on your ${APP_NAME} listing. It is a short message shown to people viewing your listing or heading to your restroom that asks them to be considerate of the business hosting it, and it suggests ${itemsPhrase} — for example a coffee, a bottle of water, or anything else you would like visitors to know about.`;
};

const paragraphs = (...parts) => parts.filter(Boolean).join('\n\n');

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------
export const OUTREACH_TEMPLATES = [
  {
    key:         TEMPLATE_KEYS.INTRO,
    label:       'Partnership introduction',
    description: 'Introduce the app, share what visitors have submitted, and offer the partner banner.',
    appliesTo:   ({ insights }) => !!insights && insights.hasPublicRestroom,
    subject:     ({ place }) => `${place.name} is listed on ${APP_NAME} — a partnership idea`,
    body: (ctx) => paragraphs(
      greeting(ctx),
      whoWeAre(),
      ratingSentence(ctx),
      amenitySentence(ctx),
      quoteBlock(ctx.insights.positiveExcerpts.slice(0, 2), 'A couple of things visitors have written:'),
      bannerOffer(ctx),
      'If you are interested, reply to this message and we can set the banner up together. There is no obligation, and you can change or remove it at any time.',
      'Thank you for keeping your restroom open to the public.',
      signature(ctx),
    ),
  },
  {
    key:         TEMPLATE_KEYS.POSITIVE,
    label:       'Share positive feedback',
    description: 'Send when reviews are strong (average 4.0 or higher). Quotes what visitors said.',
    appliesTo:   ({ insights }) =>
      !!insights && insights.hasPublicRestroom && insights.reviewCount > 0 && insights.averageRating >= 4
      && (insights.positiveExcerpts.length > 0 || insights.confirmedAmenities.length > 0),
    subject:     ({ place }) => `Visitors are rating ${place.name} well on ${APP_NAME}`,
    body: (ctx) => paragraphs(
      greeting(ctx),
      `We wanted to pass along some good news from ${APP_NAME}.`,
      ratingSentence(ctx),
      quoteBlock(ctx.insights.positiveExcerpts, 'Here is what visitors wrote:'),
      amenitySentence(ctx),
      bannerOffer(ctx),
      'Thank you for the care you put into your restroom — it shows in the feedback.',
      signature(ctx),
    ),
  },
  {
    key:         TEMPLATE_KEYS.CONCERNS,
    label:       'Share visitor concerns',
    description: 'Send when visitors have left low ratings with written feedback. Quotes their words as a courtesy heads-up.',
    appliesTo:   ({ insights }) => !!insights && insights.hasPublicRestroom && insights.concernExcerpts.length > 0,
    subject:     ({ place }) => `Visitor feedback about the restroom at ${place.name}`,
    body: (ctx) => paragraphs(
      greeting(ctx),
      `${whoWeAre()} We share feedback with the businesses on our map so they hear it directly rather than only in public reviews.`,
      ratingSentence(ctx),
      quoteBlock(ctx.insights.concernExcerpts, 'Recent visitors left the following comments:'),
      'We are passing this along as a courtesy. If anything here is out of date, or if you make changes, let us know and we will make sure your listing reflects it.',
      signature(ctx),
    ),
  },
  {
    key:         TEMPLATE_KEYS.FOLLOW_UP,
    label:       'Follow-up',
    description: 'Send when a previous message has not had a reply. References the date of the last contact.',
    appliesTo:   ({ profile }) =>
      !!profile && profile.status === PARTNERSHIP_STATUS.CONTACTED && profile.outreachLog.length > 0,
    subject:     ({ place }) => `Following up — ${place.name} and ${APP_NAME}`,
    body: (ctx) => {
      const last = ctx.profile.outreachLog[0];
      return paragraphs(
        greeting(ctx),
        `I reached out on ${formatDateLong(last.sentAt)} about ${place(ctx).name}'s listing on ${APP_NAME} and wanted to follow up in case the message was missed.`,
        ratingSentence(ctx),
        bannerOffer(ctx),
        'If now is not a good time, no problem at all — just let me know and I will check back later.',
        signature(ctx),
      );
    },
  },
  {
    key:         TEMPLATE_KEYS.BANNER_CONFIRM,
    label:       'Confirm banner details',
    description: 'Send once a banner has been drafted so the business can confirm the wording and items before it goes live.',
    appliesTo:   ({ profile }) =>
      !!profile
      && (profile.status === PARTNERSHIP_STATUS.IN_DISCUSSION || profile.status === PARTNERSHIP_STATUS.ACTIVE)
      && ((profile.banner.headline || '').trim() !== '' || profile.banner.items.length > 0),
    subject:     ({ place }) => `Please confirm your ${APP_NAME} partner banner — ${place.name}`,
    body: (ctx) => {
      const { banner } = ctx.profile;
      const courtesy   = (banner.courtesyMessage || '').trim() || (ctx.appSettings?.cobrandingCourtesyMessage || '').trim();
      const items      = banner.items.filter((i) => i.name);
      const placements = [
        banner.showOnDetails    !== false ? 'the listing page' : null,
        banner.showOnNavigation !== false ? 'the directions screen' : null,
      ].filter(Boolean);
      return paragraphs(
        greeting(ctx),
        `Here is the partner banner we have drafted for ${place(ctx).name}. Please check the wording and let us know about any changes.`,
        [
          banner.headline ? `Headline: ${banner.headline}` : null,
          courtesy        ? `Courtesy message: ${courtesy}` : null,
          items.length    ? `Suggested items:\n${items.map((i) => `  • ${i.name}${i.price ? ` — ${i.price}` : ''}`).join('\n')}` : null,
          placements.length ? `Shown on: ${joinList(placements)}` : null,
        ].filter(Boolean).join('\n'),
        'Once you confirm, we will switch the banner on. You can ask us to change or remove it at any time.',
        signature(ctx),
      );
    },
  },
  {
    key:         TEMPLATE_KEYS.NO_RESTROOM_INVITE,
    label:       'No-restroom listing notice',
    description: 'For addresses reported as having no public restroom. Tells the business how it is listed and invites a correction or a partnership.',
    appliesTo:   ({ insights }) => !!insights && !insights.hasPublicRestroom,
    subject:     ({ place }) => `${place.name} on ${APP_NAME}`,
    body: (ctx) => paragraphs(
      greeting(ctx),
      whoWeAre(),
      `Your location is currently listed on ${APP_NAME} as not having a restroom open to the public, based on a visitor report. If that is out of date, reply and we will correct the listing.`,
      `If you do offer a restroom to visitors, or would consider it, we would be glad to list it and talk about a partnership: partner listings can carry a short banner that asks visitors to be considerate and suggests items of your choosing.`,
      signature(ctx),
    ),
  },
];

const place = (ctx) => ctx.place;

export const TEMPLATE_BY_KEY = OUTREACH_TEMPLATES.reduce((acc, t) => {
  acc[t.key] = t;
  return acc;
}, {});

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
/**
 * renderTemplate(template, ctx) → { key, label, description, subject, body }
 * ctx = { place, insights, profile, appSettings }
 */
export function renderTemplate(template, ctx) {
  return {
    key:         template.key,
    label:       template.label,
    description: template.description,
    subject:     template.subject(ctx),
    body:        template.body(ctx),
  };
}

/**
 * getApplicableTemplates(ctx) → rendered templates whose appliesTo() passes,
 * in OUTREACH_TEMPLATES order.
 */
export function getApplicableTemplates(ctx) {
  if (!ctx?.place) return [];
  return OUTREACH_TEMPLATES
    .filter((t) => {
      try { return t.appliesTo(ctx); } catch (err) { return false; }
    })
    .map((t) => renderTemplate(t, ctx));
}
