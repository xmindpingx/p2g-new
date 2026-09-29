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
// Built-in template (used when Ollama is not configured, or as a fallback)
// ---------------------------------------------------------------------------
export function templateFirstContact(f) {
  const products = productPhrase(f);
  const hello = `Hello ${f.contactName || `${f.businessName} team`},`;
  const fit = products
    ? `People visiting ${f.businessName} for ${products} often look for a clean restroom first — and many don't know which nearby businesses welcome them.`
    : `People visiting ${f.businessType}s like ${f.businessName} often look for a clean restroom first — and many don't know which nearby businesses welcome them.`;
  const offer = offerLine(f);
  const sig = [f.senderName, APP_NAME, f.senderEmail].filter(Boolean).join('\n');
  const footer = [
    `If you'd rather not hear from us, just reply "no thanks" and we won't contact you again.`,
    f.senderPostalAddress,
  ].filter(Boolean).join('\n');

  return {
    email: {
      subject: `Enroll ${f.businessName}'s restroom on ${APP_NAME}${f.ourOffer ? ` — ${f.ourOffer}` : ''}`,
      body: [hello, WHAT_WE_ARE, fit, offer,
        `Enrolling takes a couple of minutes, and there's no obligation. Would you be open to a quick conversation?`,
        `Thank you,\n${sig}`, footer].filter(Boolean).join('\n\n'),
    },
    in_person: {
      script: [
        `Hi, I'm ${f.senderName} with ${APP_NAME}. Is the manager or owner available for two minutes?`,
        `${WHAT_WE_ARE}`,
        products ? `I noticed ${f.businessName} for ${products} — customers like yours are often looking for a restroom.` : `Customers of ${f.businessType}s like yours are often looking for a restroom.`,
        offer,
        `Could I leave my details, or would you like to enroll now?`,
      ].filter(Boolean).join('\n'),
    },
    phone: {
      script: [
        `"Hi, this is ${f.senderName} from ${APP_NAME}. May I speak with the owner or manager? — It's a quick, friendly call about your restroom."`,
        `"${WHAT_WE_ARE}"`,
        `"${offer || 'Enrolling is free and takes a couple of minutes.'} Could I send you the details by email?"`,
        `If they decline: "No problem — thank you for your time." Then mark them Declined so we don't contact them again.`,
      ].join('\n'),
    },
    text: {
      message: `Hi, this is ${f.senderName} from ${APP_NAME} — a free app that helps people find clean public restrooms. We'd love to list ${f.businessName}'s restroom.${offer ? ` ${offer}` : ''} Interested? Reply STOP and we won't message again.`,
    },
  };
}

// ---------------------------------------------------------------------------
// AI drafts
// ---------------------------------------------------------------------------
const OUTREACH_SYSTEM = `You write first-contact messages from the ${APP_NAME} team to a local business owner or manager, inviting them to enroll their own restroom in the app.
Hard rules:
- Use ONLY the facts in the JSON you are given. Do not invent products, menu items, prices, reviews, customer counts, statistics, awards, promises, web addresses, phone numbers or email addresses. The only contact detail you may write is "senderEmail", if present.
- If "sellsAccordingToOurTeam" or "cuisine" is present, mention those products naturally in the pitch (why people who come for them also look for a restroom). If neither is present, refer only to the business type.
- Do not promise more customers, revenue or rankings.
- "ourOffer" is a thank-you to the BUSINESS for enrolling its own restroom. If present, write it exactly as given, once, and never say it goes to customers. If it is null, do not mention any offer or any dollar amount.
- Friendly, brief, professional. Address "contactName" if given, otherwise the "<businessName> team".
- Sign as "senderName". No other placeholders.
- The email must end with the opt-out line: If you'd rather not hear from us, just reply "no thanks" and we won't contact you again. — followed by "senderPostalAddress" if it is present.
- The text message must be under 300 characters and include "Reply STOP".
Answer with JSON only, exactly: {"email":{"subject":"...","body":"..."},"in_person":{"script":"..."},"phone":{"script":"..."},"text":{"message":"..."}}`;

const asText = (v) => (typeof v === 'string' ? v.trim() : '');
const pick = (v, ...keys) => {
  if (typeof v === 'string') return v.trim();
  if (v && typeof v === 'object') for (const k of keys) if (typeof v[k] === 'string' && v[k].trim()) return v[k].trim();
  return '';
};

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const URL_RE   = /(https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(com|org|net|io|app|co|us|biz|info|edu|gov)\b(\/\S*)?/gi;
const PHONE_RE = /\+?\d[\d\s().-]{7,}\d/g;
const STOP     = new Set(['and', 'the', 'for', 'with', 'fresh', 'made', 'local', 'from', 'our', 'their', 'your']);
const sentencesOf = (t) => t.split(/(?<=[.!?])\s+|\n+/);

/** Problems with a set of drafts → [{ channel, message }]. Empty when the drafts obey every rule. */
export function validateDrafts(drafts, facts) {
  const problems = [];
  const bad = (channel, message) => problems.push({ channel, message });
  const channels = { email: `${drafts.email.subject}\n${drafts.email.body}`, in_person: drafts.in_person.script, phone: drafts.phone.script, text: drafts.text.message };

  for (const [ch, raw] of Object.entries(channels)) {
    if (!raw) { bad(ch, 'was empty'); continue; }
    const noOwn = raw.replace(EMAIL_RE, (e) => (facts.senderEmail && e.toLowerCase() === facts.senderEmail.toLowerCase() ? '' : e));
    if ((noOwn.match(EMAIL_RE) || []).length) bad(ch, 'contains an email address that was not provided');
    const noEmails = noOwn.replace(EMAIL_RE, '');
    if ((noEmails.match(URL_RE) || []).length) bad(ch, 'contains a web address that was not provided');
    const noAddress = facts.senderPostalAddress ? noEmails.replace(facts.senderPostalAddress, '') : noEmails;
    if ((noAddress.match(PHONE_RE) || []).length) bad(ch, 'contains a phone number that was not provided');
    if (facts.ourOffer) {
      for (const sent of sentencesOf(raw)) if (sent.includes(facts.ourOffer) && /customer|patron|guest|visitor|shopper/i.test(sent)) bad(ch, `says the offer "${facts.ourOffer}" goes to customers — it is a thank-you to the business`);
    } else if (/\$\s?\d/.test(raw)) bad(ch, 'mentions a dollar amount but there is no offer');
  }

  if (facts.ourOffer && !drafts.email.body.includes(facts.ourOffer)) bad('email', `must state the offer exactly as "${facts.ourOffer}"`);
  if (!/no thanks/i.test(drafts.email.body)) bad('email', 'is missing the "no thanks" opt-out line');
  if (facts.senderPostalAddress && !drafts.email.body.includes(facts.senderPostalAddress)) bad('email', 'is missing the postal address');
  if (!drafts.email.body.includes(facts.senderName)) bad('email', 'is not signed with the sender name');
  if (drafts.text.message.length >= 300) bad('text', 'is 300 characters or longer');
  if (drafts.text.message && !/stop/i.test(drafts.text.message)) bad('text', 'is missing "Reply STOP"');

  const sold = facts.sellsAccordingToOurTeam || '';
  if (sold) {
    const words = sold.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4 && !STOP.has(w));
    if (words.length && !words.some((w) => drafts.email.body.toLowerCase().includes(w))) bad('email', `does not mention what they sell ("${sold}")`);
  }
  return problems;
}

const shapeDrafts = (out) => ({
  email:     { subject: pick(out?.email, 'subject'), body: pick(out?.email, 'body', 'message', 'text') },
  in_person: { script: pick(out?.in_person ?? out?.inPerson, 'script', 'message', 'text') },
  phone:     { script: pick(out?.phone, 'script', 'message', 'text') },
  text:      { message: pick(out?.text ?? out?.sms, 'message', 'text', 'body') },
});

/**
 * buildFirstContact(prospect, settings, { sells, contactName })
 * → { drafts, source: 'ai'|'template', note }
 * The AI answer is checked against validateDrafts(); on a problem the model is
 * asked once more with the problems listed, and any channel that still fails
 * uses the built-in template instead. Falls back entirely when Ollama is off
 * or unreachable.
 */
export async function buildFirstContact(prospect, settings, opts = {}) {
  const facts = buildFacts(prospect, settings, opts);
  const template = templateFirstContact(facts);
  if (!isOllamaReady(settings)) {
    return { drafts: template, source: 'template', note: 'Ollama is not configured, so the built-in template was used.' };
  }
  try {
    const base = `Facts:\n${JSON.stringify(facts, null, 2)}`;
    let drafts = shapeDrafts(await ollamaJson(settings, { system: OUTREACH_SYSTEM, prompt: base }));
    let problems = validateDrafts(drafts, facts);
    if (problems.length) {
      const list = problems.map((p) => `- the ${p.channel.replace('_', ' ')} ${p.message}`).join('\n');
      drafts = shapeDrafts(await ollamaJson(settings, { system: OUTREACH_SYSTEM, prompt: `${base}\n\nYour previous answer broke these rules:\n${list}\nWrite all four messages again and fix every one of them.` }));
      problems = validateDrafts(drafts, facts);
    }
    const failedChannels = [...new Set(problems.map((p) => p.channel))];
    for (const ch of failedChannels) drafts[ch] = template[ch];
    const names = { email: 'email', in_person: 'in-person', phone: 'phone', text: 'text' };
    return {
      drafts,
      source: failedChannels.length === CHANNELS.length ? 'template' : 'ai',
      note: failedChannels.length
        ? `The AI's ${failedChannels.map((c) => names[c]).join(', ')} draft broke the writing rules twice (${problems.slice(0, 2).map((p) => p.message).join('; ')}) — the built-in template was used for ${failedChannels.length === 1 ? 'it' : 'those'}.`
        : null,
    };
  } catch (err) {
    return { drafts: template, source: 'template', note: `AI drafting failed (${err.message}). The built-in template was used.` };
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
    const priority = Math.min(5, Math.max(1, Math.round(Number(r.priority) || 0)));
    const positives = (p.fit?.reasons || []).filter((x) => x.startsWith('+')).map((x) => x.replace(/^\+\d+\s*/, ''));
    result[p.id] = { priority, reason: positives.length ? positives.slice(0, 3).join(' · ') : 'No strong positive signals in the data' };
  }
  if (Object.keys(result).length === 0) throw new Error('The model returned no usable ranking');
  return result;
}
