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
- Use ONLY the facts in the JSON you are given. Do not invent products, menu items, prices, reviews, customer counts, statistics, awards or promises.
- If "sellsAccordingToOurTeam" or "cuisine" is present, tailor the pitch to those products in a natural way. If neither is present, refer only to the business type.
- Do not promise more customers, revenue or rankings.
- If "ourOffer" is present, state that offer exactly as written, once. If it is null, do not mention any offer.
- Friendly, brief, professional. Address "contactName" if given, otherwise the "<businessName> team".
- Sign as "senderName". Never leave other placeholders.
- The email must end with an opt-out line ("If you'd rather not hear from us, just reply "no thanks" and we won't contact you again.") and, if "senderPostalAddress" is present, that address.
- The text message must be under 300 characters and include "Reply STOP".
Answer with JSON only, exactly: {"email":{"subject":"...","body":"..."},"in_person":{"script":"..."},"phone":{"script":"..."},"text":{"message":"..."}}`;

const asText = (v) => (typeof v === 'string' ? v.trim() : '');

/**
 * buildFirstContact(prospect, settings, { sells, contactName })
 * → { drafts, source: 'ai'|'template', note }
 * Falls back to the template (with the reason in `note`) when Ollama is off or fails.
 */
export async function buildFirstContact(prospect, settings, opts = {}) {
  const facts = buildFacts(prospect, settings, opts);
  const template = templateFirstContact(facts);
  if (!isOllamaReady(settings)) {
    return { drafts: template, source: 'template', note: 'Ollama is not configured, so the built-in template was used.' };
  }
  try {
    const out = await ollamaJson(settings, { system: OUTREACH_SYSTEM, prompt: `Facts:\n${JSON.stringify(facts, null, 2)}` });
    const drafts = {
      email:     { subject: asText(out?.email?.subject), body: asText(out?.email?.body) },
      in_person: { script: asText(out?.in_person?.script) },
      phone:     { script: asText(out?.phone?.script) },
      text:      { message: asText(out?.text?.message) },
    };
    // Guardrails: anything missing falls back to the template's version of that channel.
    const missing = [];
    if (!drafts.email.subject || !drafts.email.body) { drafts.email = template.email; missing.push('email'); }
    if (!drafts.in_person.script) { drafts.in_person = template.in_person; missing.push('in person'); }
    if (!drafts.phone.script)     { drafts.phone = template.phone; missing.push('phone'); }
    if (!drafts.text.message)     { drafts.text = template.text; missing.push('text'); }
    // The offer must appear exactly as configured when set, and never when off.
    if (facts.ourOffer && !drafts.email.body.includes(facts.ourOffer)) { drafts.email = template.email; missing.push('email (offer wording)'); }
    if (!facts.ourOffer && /\$\d/.test(drafts.email.body + drafts.text.message)) { drafts.email = template.email; drafts.text = template.text; missing.push('email and text (unexpected price)'); }
    return { drafts, source: 'ai', note: missing.length ? `The AI answer was incomplete or off-rules for: ${missing.join(', ')} — the built-in template was used for those.` : null };
  } catch (err) {
    return { drafts: template, source: 'template', note: `AI drafting failed (${err.message}). The built-in template was used.` };
  }
}

// ---------------------------------------------------------------------------
// AI ranking
// ---------------------------------------------------------------------------
const RANK_SYSTEM = `You help ${APP_NAME} choose which local businesses to invite first. ${APP_NAME} lists businesses whose restroom is open to the public.
You are given businesses with facts from OpenStreetMap and a rule-based fit score. Rank them by how good a first partner they would be, using ONLY the facts given (restroom listed, accessibility, contactability, business type, distance, chain vs independent). Do not invent facts.
Answer with JSON only: {"ranking":[{"id":"<id>","priority":1-5,"reason":"one short sentence using only given facts"}]} — priority 5 is best. Include every id given.`;

/** rankProspects(prospects, settings) → { [id]: { priority, reason } } */
export async function rankProspects(prospects, settings) {
  const slim = prospects.slice(0, 30).map((p) => ({
    id: p.id, name: p.name, type: p.categoryLabel, brand: p.brand, cuisine: p.cuisines?.join(', ') || null,
    toilets: p.toilets, wheelchair: p.wheelchair, hasEmail: !!p.email, hasPhone: !!p.phone, hasWebsite: !!p.website,
    distanceMeters: p.distanceMeters, fitPoints: p.fit?.points ?? null,
  }));
  const out = await ollamaJson(settings, { system: RANK_SYSTEM, prompt: `Businesses:\n${JSON.stringify(slim)}`, maxTokens: 1500, temperature: 0.2, timeoutMs: 120000 });
  const result = {};
  for (const r of out?.ranking || []) {
    if (!r?.id || !slim.some((s) => s.id === r.id)) continue;
    const priority = Math.min(5, Math.max(1, Math.round(Number(r.priority) || 0)));
    result[r.id] = { priority, reason: asText(r.reason).slice(0, 200) };
  }
  if (Object.keys(result).length === 0) throw new Error('The model returned no usable ranking');
  return result;
}
