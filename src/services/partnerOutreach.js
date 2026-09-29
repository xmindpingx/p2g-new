// places2go — Partner ranking and first-contact drafts
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
//
// Two jobs:
//   rankProspects()          — Ollama orders a shortlist using only the facts in
//                              each prospect record and gives a one-line reason.
//   buildFirstContact()      — first-contact suggestions for four channels
//                              (email, in person, phone, text), customised to
//                              what the business sells. Uses Ollama when it is
//                              configured, otherwise the built-in template. Both
//                              are fed the same facts and neither may add
//                              products, prices, statistics or promises that are
//                              not in them.
//
// "What they sell" comes only from: the OpenStreetMap tags (business type,
// cuisine, brand) and text the administrator typed after looking at the
// business. The admin edits every draft before sending.

import { ollamaJson, isOllamaReady } from './ollama';
import { incentiveText } from '../constants/partners';
import { APP_NAME } from '../utils/cobrandingTemplates';

export const CHANNELS = ['email', 'in_person', 'phone', 'text'];
export const CHANNEL_LABELS = { email: 'Email', in_person: 'In person', phone: 'Phone call', text: 'Text / DM' };

const WHAT_WE_ARE = `${APP_NAME} is a free community app that helps people find clean, accessible public restrooms nearby. Businesses that enroll their own restroom appear on the map, and visitors rate and review them.`;

/** The facts a draft may use. Everything else is off limits. */
export function buildFacts(prospect, settings, { sells = '', contactName = '' } = {}) {
  const sold = (sells || prospect.sells || '').trim();
  return {
    businessName: prospect.name,
    businessType: prospect.categoryLabel,
    brand:        prospect.brand || null,
    cuisine:      prospect.cuisines?.length ? prospect.cuisines.join(', ') : null,
    sellsAccordingToOurTeam: sold || null,
    address:      prospect.address || null,
    wheelchairAccessibleAccordingToOpenStreetMap: prospect.wheelchair === 'yes' ? true : null,
    toiletsAccordingToOpenStreetMap: prospect.toilets || null,
    contactName:  contactName || null,
    ourOffer:     incentiveText(settings) || null,
    senderName:   (settings.cobrandingSenderName || '').trim() || '[Your name]',
    senderEmail:  (settings.cobrandingSenderEmail || '').trim() || null,
    senderPostalAddress: (settings.cobrandingSenderAddress || '').trim() || null,
    whatWeAre:    WHAT_WE_ARE,
  };
}

/** "your espresso and pastries" / "your coffee shop" — from real facts only. */
const productPhrase = (f) => {
  if (f.sellsAccordingToOurTeam) return f.sellsAccordingToOurTeam;
  if (f.cuisine) return f.cuisine;
  return null;
};

const offerLine = (f) => (f.ourOffer
  ? `As a thank-you for enrolling your own restroom, we're offering ${f.ourOffer}.`
  : null);

// ---------------------------------------------------------------------------
// Assembly — the fixed parts are always written by code, so they are always exact
// ---------------------------------------------------------------------------
/** Default tailored pitch sentence(s), from real facts only. */
export function defaultPitches(f) {
  const products = productPhrase(f);
  const lead = products
    ? `People visiting ${f.businessName} for ${products} often look for a clean restroom first — and many don't know which nearby businesses welcome them.`
    : `People visiting ${f.businessType}s like ${f.businessName} often look for a clean restroom first — and many don't know which nearby businesses welcome them.`;
  return {
    subject: `Enroll ${f.businessName}'s restroom on ${APP_NAME}`,
    email: lead,
    in_person: products ? `I noticed ${f.businessName} for ${products} — customers like yours are often looking for a restroom.` : `Customers of ${f.businessType}s like yours are often looking for a restroom.`,
    phone: products ? `${f.businessName} is known for ${products}, and people who stop in are often looking for a restroom.` : `People who stop in at ${f.businessType}s like yours are often looking for a restroom.`,
    text: products ? `People who come for ${products} often need a restroom too.` : `People visiting ${f.businessType}s often need a restroom.`,
  };
}

/** assembleDrafts(facts, pitches) → { email, in_person, phone, text } */
export function assembleDrafts(f, pitches) {
  const hello = `Hello ${f.contactName || `${f.businessName} team`},`;
  const offer = offerLine(f);
  const sig = [f.senderName, APP_NAME, f.senderEmail].filter(Boolean).join('\n');
  const footer = [`If you'd rather not hear from us, just reply "no thanks" and we won't contact you again.`, f.senderPostalAddress].filter(Boolean).join('\n');
  const textLead = `Hi, this is ${f.senderName} from ${APP_NAME} — a free app that helps people find clean public restrooms. We'd love to list ${f.businessName}'s restroom.`;
  const textTail = `${offer ? `${offer} ` : ''}Interested? Reply STOP and we won't message again.`;
  const fits = (pitch) => `${textLead} ${pitch} ${textTail}`.length < 300;

  return {
    email: {
      subject: `${pitches.subject}${f.ourOffer ? ` — ${f.ourOffer}` : ''}`,
      body: [hello, WHAT_WE_ARE, pitches.email, offer,
        `Enrolling takes a couple of minutes, and there's no obligation. Would you be open to a quick conversation?`,
        `Thank you,\n${sig}`, footer].filter(Boolean).join('\n\n'),
    },
    in_person: {
      script: [
        `Hi, I'm ${f.senderName} with ${APP_NAME}. Is the manager or owner available for two minutes?`,
        WHAT_WE_ARE, pitches.in_person, offer,
        `Could I leave my details, or would you like to enroll now?`,
      ].filter(Boolean).join('\n'),
    },
    phone: {
      script: [
        `"Hi, this is ${f.senderName} from ${APP_NAME}. May I speak with the owner or manager? It's a quick, friendly call about your restroom."`,
        `"${WHAT_WE_ARE}"`,
        `"${pitches.phone}"`,
        `"${offer || 'Enrolling is free and takes a couple of minutes.'} Could I send you the details by email?"`,
        `If they decline: "No problem — thank you for your time." Then mark them Declined so we don't contact them again.`,
      ].join('\n'),
    },
    text: { message: `${textLead} ${fits(pitches.text) ? `${pitches.text} ` : ''}${textTail}` },
  };
}

export const templateFirstContact = (f) => assembleDrafts(f, defaultPitches(f));

// ---------------------------------------------------------------------------
// AI pitches — the model writes only the tailored sentences
// ---------------------------------------------------------------------------
const OUTREACH_SYSTEM = `You help the ${APP_NAME} team write the tailored part of first-contact messages to a local business, inviting them to enroll their own restroom in the app. A program adds the greeting, offer, sign-off and legal lines — you write ONLY the short tailored pitch for each channel.
Hard rules:
- Use ONLY the facts in the JSON. Do not invent products, menu items, prices, reviews, customer counts, statistics, awards, promises, web addresses, phone numbers or email addresses.
- If "sellsAccordingToOurTeam" or "cuisine" is present, mention those products naturally: why people who come for them also look for a restroom, and how a listed, welcoming restroom fits their business. If neither is present, refer only to the business type.
- Do not promise more customers, sales, revenue or rankings. Do not mention any offer, discount or dollar amount.
- No greeting, no sign-off, no contact details.
- Friendly, plain, specific to this business. "email", "in_person", "phone": 1–2 sentences, under 350 characters each. "text": one sentence under 110 characters. "subject": an email subject under 70 characters that names the business.
Answer with JSON only, exactly: {"subject":"...","email":"...","in_person":"...","phone":"...","text":"..."}`;

const asText = (v) => (typeof v === 'string' ? v.trim() : '');
const pickPitch = (v) => (typeof v === 'string' ? v.trim() : v && typeof v === 'object' ? asText(v.pitch || v.text || v.message || v.body || v.script) : '');

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const URL_RE   = /(https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(com|org|net|io|app|co|us|biz|info|edu|gov)\b(\/\S*)?/gi;
const PHONE_RE = /\+?\d[\d\s().-]{7,}\d/g;
const PROMISE  = /(guarantee|more customers|more foot traffic|increase (your )?(sales|revenue|traffic|business)|boost (your )?(sales|revenue|traffic|business)|#1|number one|best in)/i;
const STOP     = new Set(['and', 'the', 'for', 'with', 'fresh', 'made', 'local', 'from', 'our', 'their', 'your']);
const LIMITS   = { subject: 70, email: 350, in_person: 350, phone: 350, text: 110 };

/** Problems with the model's pitches → [{ channel, message }]. Empty when they obey every rule. */
export function validatePitches(pitches, facts) {
  const problems = [];
  const bad = (channel, message) => problems.push({ channel, message });
  for (const [ch, raw] of Object.entries(pitches)) {
    if (!raw) { bad(ch, 'was empty'); continue; }
    if (raw.length > LIMITS[ch]) bad(ch, `is longer than ${LIMITS[ch]} characters`);
    if ((raw.match(EMAIL_RE) || []).length) bad(ch, 'contains an email address');
    if ((raw.replace(EMAIL_RE, '').match(URL_RE) || []).length) bad(ch, 'contains a web address');
    if ((raw.match(PHONE_RE) || []).length) bad(ch, 'contains a phone number');
    if (/\$\s?\d|\b\d+\s?%|discount|\boff\b/i.test(raw)) bad(ch, 'mentions an offer or price — the program adds the offer');
    if (PROMISE.test(raw)) bad(ch, 'makes a promise or claim we cannot support');
    if (/^\s*(hello|hi|dear)\b/i.test(raw) && ch !== 'subject') bad(ch, 'includes a greeting');
  }
  const sold = facts.sellsAccordingToOurTeam || '';
  if (sold && pitches.email) {
    const words = sold.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4 && !STOP.has(w));
    if (words.length && !words.some((w) => pitches.email.toLowerCase().includes(w))) bad('email', `does not mention what they sell ("${sold}")`);
  }
  return problems;
}

const shapePitches = (out) => ({
  subject: pickPitch(out?.subject), email: pickPitch(out?.email), in_person: pickPitch(out?.in_person ?? out?.inPerson),
  phone: pickPitch(out?.phone), text: pickPitch(out?.text ?? out?.sms),
});

/**
 * buildFirstContact(prospect, settings, { sells, contactName })
 * → { drafts, source: 'ai'|'template', note }
 * The model's pitches are checked with validatePitches(); on a problem it is
 * asked once more with the problems listed, and any pitch that still fails is
 * replaced by the built-in wording. Falls back entirely when Ollama is off or
 * unreachable.
 */
export async function buildFirstContact(prospect, settings, opts = {}) {
  const facts = buildFacts(prospect, settings, opts);
  const defaults = defaultPitches(facts);
  if (!isOllamaReady(settings)) {
    return { drafts: assembleDrafts(facts, defaults), source: 'template', note: 'Ollama is not configured, so the built-in wording was used.' };
  }
  try {
    const base = `Facts:\n${JSON.stringify({ ...facts, whatWeAre: undefined, ourOffer: undefined, senderName: undefined, senderEmail: undefined, senderPostalAddress: undefined }, null, 2)}`;
    let pitches = shapePitches(await ollamaJson(settings, { system: OUTREACH_SYSTEM, prompt: base, maxTokens: 500 }));
    let problems = validatePitches(pitches, facts);
    if (problems.length) {
      const list = problems.map((p) => `- the "${p.channel}" pitch ${p.message}`).join('\n');
      pitches = shapePitches(await ollamaJson(settings, { system: OUTREACH_SYSTEM, prompt: `${base}\n\nYour previous answer broke these rules:\n${list}\nWrite all five fields again and fix every one of them.`, maxTokens: 500 }));
      problems = validatePitches(pitches, facts);
    }
    const failed = [...new Set(problems.map((p) => p.channel))];
    const finalPitches = { ...pitches };
    for (const ch of failed) finalPitches[ch] = defaults[ch];
    return {
      drafts: assembleDrafts(facts, finalPitches),
      source: failed.length === Object.keys(defaults).length ? 'template' : 'ai',
      note: failed.length ? `The AI's ${failed.join(', ').replace(/_/g, ' ')} pitch broke the writing rules twice (${problems.slice(0, 2).map((p) => p.message).join('; ')}) — built-in wording used for ${failed.length === 1 ? 'it' : 'those'}.` : null,
    };
  } catch (err) {
    return { drafts: assembleDrafts(facts, defaults), source: 'template', note: `AI drafting failed (${err.message}). The built-in wording was used.` };
  }
}

// ---------------------------------------------------------------------------
// AI ranking
// ---------------------------------------------------------------------------
const RANK_SYSTEM = `You help ${APP_NAME} choose which local businesses to invite first. ${APP_NAME} lists businesses whose restroom is open to the public.
You are given businesses with facts from OpenStreetMap and a rule-based fit score. A value of "unknown" means OpenStreetMap has no data — it is NOT a "no". Rank using ONLY the given facts (restroom listed, accessibility, contactability, business type, distance, chain vs independent).
Answer with JSON only: {"ranking":[{"id":"<id>","priority":1-5}]} — priority 5 is the best first partner. Include every id given.`;

/**
 * rankProspects(prospects, settings) → { [id]: { priority, reason } }
 * The model supplies only the priority. The reason shown is built from the
 * business's own fit points, so it can never state a fact the data lacks.
 */
export async function rankProspects(prospects, settings) {
  const known = (v) => (v == null || v === '' ? 'unknown' : v);
  const subset = prospects.slice(0, 30);
  const slim = subset.map((p) => ({
    id: p.id, name: p.name, type: p.categoryLabel, chain: p.brand || 'independent / unknown', cuisine: p.cuisines?.length ? p.cuisines.join(', ') : 'unknown',
    toilets: known(p.toilets), wheelchair: known(p.wheelchair), email: p.email ? 'on record' : 'none on record', phone: p.phone ? 'on record' : 'none on record',
    distanceMeters: p.distanceMeters, fitPoints: p.fit?.points ?? null,
  }));
  const out = await ollamaJson(settings, { system: RANK_SYSTEM, prompt: `Businesses:\n${JSON.stringify(slim)}`, maxTokens: 1500, temperature: 0.2, timeoutMs: 120000 });
  const result = {};
  for (const r of out?.ranking || []) {
    const p = subset.find((x) => x.id === r?.id);
    if (!p) continue;
    let priority = Math.min(5, Math.max(1, Math.round(Number(r.priority) || 0)));
    if (p.toilets === 'no') priority = Math.min(priority, 2); // OpenStreetMap says no toilets — never a top pick
    const positives = (p.fit?.reasons || []).filter((x) => x.startsWith('+')).map((x) => x.replace(/^\+\d+\s*/, ''));
    result[p.id] = { priority, reason: positives.length ? positives.slice(0, 3).join(' · ') : 'No strong positive signals in the data' };
  }
  if (Object.keys(result).length === 0) throw new Error('The model returned no usable ranking');
  return result;
}
