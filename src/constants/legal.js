// places2go — Legal documents
// Terms of Service, Privacy Policy, Contributor Payout & Safety Terms, and
// Community Guidelines. Shown on first launch (mandatory acceptance), from the
// Profile screen, and referenced by the Add Place safety acknowledgment.
//
// Every {{token}} is filled from appSettings (Admin Settings → Legal) so the
// owner, jurisdiction, trademark and patent wording can be edited without a
// code change. Bump LEGAL_VERSION whenever the wording changes: users who
// accepted an older version are asked to accept again on next launch.
//
// This text is a drafting starting point, not legal advice. Have it reviewed
// by a lawyer licensed in your jurisdiction before release. In particular,
// releases and liability waivers are limited by law in some places and never
// cover gross negligence or wilful misconduct.

export const LEGAL_VERSION = '2026-09-29';

export const LEGAL_DOCS = {
  TERMS:       'terms',
  PRIVACY:     'privacy',
  CONTRIBUTOR: 'contributor',
  GUIDELINES:  'guidelines',
};

export const LEGAL_DOC_LABELS = {
  [LEGAL_DOCS.TERMS]:       'Terms of Service',
  [LEGAL_DOCS.PRIVACY]:     'Privacy Policy',
  [LEGAL_DOCS.CONTRIBUTOR]: 'Contributor Terms',
  [LEGAL_DOCS.GUIDELINES]:  'Community Guidelines',
};

export const LEGAL_DOC_ORDER = [
  LEGAL_DOCS.TERMS,
  LEGAL_DOCS.PRIVACY,
  LEGAL_DOCS.CONTRIBUTOR,
  LEGAL_DOCS.GUIDELINES,
];

// ---------------------------------------------------------------------------
// Token rendering
// ---------------------------------------------------------------------------
const NOT_SET = (label) => `[${label} — not set in Admin Settings → Legal]`;

export function buildLegalContext(appSettings = {}) {
  const s = appSettings;
  const trademarkName   = (s.legalTrademarkName || 'places2go').trim();
  const trademarkSymbol = s.legalTrademarkRegistered ? '®' : '™';
  const patentNumbers   = (s.legalPatentNumbers || '').split(',').map((n) => n.trim()).filter(Boolean);
  return {
    appName:               'places2go',
    entity:                (s.legalEntityName || '').trim() || NOT_SET('Operating entity'),
    jurisdiction:          (s.legalJurisdiction || '').trim() || NOT_SET('Governing law jurisdiction'),
    contactEmail:          (s.legalContactEmail || '').trim() || NOT_SET('Legal contact email'),
    copyrightOwner:        (s.legalCopyrightOwner || '').trim() || NOT_SET('Copyright owner'),
    copyrightLocation:     (s.legalCopyrightLocation || '').trim(),
    copyrightYears:        (s.legalCopyrightYears || '').trim() || String(new Date().getFullYear()),
    trademarkName,
    trademarkSymbol,
    trademark:             `${trademarkName}${trademarkSymbol}`,
    trademarkStatusPhrase: s.legalTrademarkRegistered ? 'a registered trademark' : 'a trademark',
    patentNotice:          (s.legalPatentNotice || '').trim(),
    patentNumbers:         patentNumbers.join(', '),
    minimumAge:            Number.isFinite(s.legalMinimumAge) ? s.legalMinimumAge : 13,
    contributorMinimumAge: Number.isFinite(s.legalContributorMinimumAge) ? s.legalContributorMinimumAge : 18,
    payoutAmount:          Number.isFinite(s.payoutAmountUSD) ? `$${s.payoutAmountUSD.toFixed(2)}` : 'the amount shown in the app',
    effectiveDate:         LEGAL_VERSION,
  };
}

export function renderLegalTokens(text, ctx) {
  return String(text).replace(/\{\{(\w+)\}\}/g, (match, key) =>
    ctx[key] !== undefined && ctx[key] !== null ? String(ctx[key]) : match,
  );
}

/**
 * buildOwnershipNotice(appSettings) → one line for footers, e.g.
 * "places2go™ is a trademark of Chris Gavan. © 2026–2027 Chris Gavan, Arizona.
 *  All rights reserved. Patent pending."
 */
export function buildOwnershipNotice(appSettings = {}) {
  const c = buildLegalContext(appSettings);
  const owner = c.copyrightLocation ? `${c.copyrightOwner}, ${c.copyrightLocation}` : c.copyrightOwner;
  const parts = [
    `${c.trademark} is ${c.trademarkStatusPhrase} of ${c.copyrightOwner}.`,
    `© ${c.copyrightYears} ${owner}. All rights reserved.`,
  ];
  if (c.patentNotice) {
    parts.push(c.patentNumbers ? `${c.patentNotice} (${c.patentNumbers}).` : `${c.patentNotice}.`);
  }
  return parts.join(' ');
}

export function buildCopyrightLine(appSettings = {}) {
  const c = buildLegalContext(appSettings);
  const owner = c.copyrightLocation ? `${c.copyrightOwner}, ${c.copyrightLocation}` : c.copyrightOwner;
  return `© ${c.copyrightYears} ${owner}. All rights reserved.`;
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------
const TERMS_OF_SERVICE = {
  key:   LEGAL_DOCS.TERMS,
  title: 'Terms of Service',
  intro: 'Effective {{effectiveDate}}. These Terms of Service ("Terms") are a binding agreement between you and {{entity}} ("we", "us", "places2go"), the operator of the {{appName}} mobile application and related services (the "Service"). Please read them carefully.',
  sections: [
    {
      title: '1. Acceptance of these Terms',
      paragraphs: [
        'By tapping "Agree & continue", creating an account, or using the Service in any way, you agree to these Terms, our Privacy Policy, the Contributor Terms, and the Community Guidelines (together, the "Agreement"). If you do not agree, do not use the Service.',
        'We may update the Agreement. When we do, the app will show the new version and ask you to accept it before continuing. Your continued use after accepting is your agreement to the updated terms.',
      ],
    },
    {
      title: '2. Who may use the Service',
      paragraphs: [
        'You must be at least {{minimumAge}} years old to use the Service. You must be at least {{contributorMinimumAge}} years old, or the age of majority where you live if higher, to add places, submit reviews or photos, or take part in the contributor credit program. By using those features you represent that you meet these requirements.',
        'You must have the legal capacity to enter into this Agreement, and you may not use the Service if you have been previously suspended or removed from it.',
      ],
    },
    {
      title: '3. Accounts and sign-in',
      paragraphs: [
        'You may browse as a guest, or sign in with Apple or Google. Signing in creates a profile that lets us attribute your contributions and pay any credits you earn. You are responsible for keeping your device and sign-in method secure and for everything done through your profile.',
        'You may skip sign-in at any time. Local data on your device (saved places, your submissions) stays on your device until you clear it or remove the app.',
      ],
    },
    {
      title: '4. What the Service is — and is not',
      paragraphs: [
        'The Service shows information about public restrooms that other users have submitted, together with community ratings and reviews. This information is crowdsourced. We do not own, operate, inspect, or control any of the locations listed, and we do not guarantee that any listing is accurate, current, safe, clean, open, accessible, or that a restroom exists at all.',
        'A "Verified" label means only that an administrator reviewed the submission at some point in time. It is not a guarantee, inspection, or endorsement of the location or the business.',
        'A "No public restroom" listing is a report from a user that a restroom was not available to the public at that address when they visited. Conditions change and reports can be wrong.',
        'The Service is not an emergency service and is not a substitute for your own judgment. In an emergency, contact your local emergency number.',
      ],
    },
    {
      title: '5. Your content',
      paragraphs: [
        'You keep ownership of the places, reviews, photos, notes and other material you submit ("Your Content"). You grant us a worldwide, non-exclusive, royalty-free, perpetual, irrevocable, sublicensable license to host, store, reproduce, modify (for example to resize or crop), publish, display, distribute and otherwise use Your Content in connection with operating, improving, promoting and protecting the Service, including sharing your public reviews with the business they concern.',
        'You represent that you have all rights needed to grant this license; that Your Content is accurate to the best of your knowledge; that it does not include any identifiable person without their consent; that no photo was taken of or inside a restroom while any person was present; and that Your Content does not violate any law or the rights of any third party.',
        'Submissions may be screened by automated systems, including artificial-intelligence models, and by human moderators. We may hide, edit, or remove any content, and may decline any submission, at our sole discretion and without notice. We are not obliged to publish anything.',
      ],
    },
    {
      title: '6. Contributor conduct and safety',
      paragraphs: [
        'Adding a place means physically visiting a location, which is an activity you choose to undertake on your own. You must obey all laws and posted rules, respect private property, stay in areas open to the public, leave promptly when asked, and never put yourself or anyone else at risk to make a submission. Full safety rules are in the Contributor Terms, which form part of this Agreement.',
        'You act on your own behalf. You are not our employee, agent, contractor, volunteer or representative, and you have no authority to speak or act for us.',
      ],
    },
    {
      title: '7. Assumption of risk, release and indemnity',
      paragraphs: [
        'ASSUMPTION OF RISK. Visiting, evaluating, photographing, reviewing or reporting any location — and travelling to or from it — involves risks, including traffic and pedestrian hazards, slips and falls, unsanitary conditions, exposure to illness, criminal activity, confrontations with property owners, staff, or members of the public, trespass allegations, fines, arrest, property damage, injury, and death. You understand these risks, they are your own, and you voluntarily accept all of them, whether or not they are listed here.',
        'RELEASE. To the fullest extent permitted by law, you release, waive and discharge {{entity}}, and its owners, officers, employees, agents, contractors, licensors and successors (the "Released Parties"), from any and all claims, demands, losses, damages, liabilities, costs and expenses of every kind, whether known or unknown, arising out of or connected with your use of the Service or your contributor activities, including anything that happens to you, or that you cause to happen to anyone else or their property, while travelling to, visiting, or leaving a location, or while making a submission.',
        'INDEMNITY. You agree to defend, indemnify and hold harmless the Released Parties from and against any claim, demand, suit, loss, liability, damage, fine, penalty, cost or expense (including reasonable legal fees) brought by any person or authority that arises out of or relates to: your conduct while contributing; Your Content; your violation of any law, posted rule or third-party right; or your breach of this Agreement.',
        'These provisions apply to the fullest extent permitted by applicable law and do not release liability that cannot be waived by law, such as liability for gross negligence, wilful misconduct, or fraud. They survive any termination of this Agreement or your account.',
      ],
    },
    {
      title: '8. Contributor credits and payouts',
      paragraphs: [
        'We may offer a credit of {{payoutAmount}} for each qualifying contribution — currently, adding a new place together with a qualifying review, or a "No public restroom" report that an administrator verifies. Qualification rules are shown in the app and may change. Credits are approved at our discretion, may be declined for inaccurate, duplicate, low-quality or suspected fraudulent submissions, and are governed by the Contributor Terms.',
        'Credits are a discretionary program payment, not wages, and do not create an employment or contractor relationship. The program may be changed, paused or ended at any time. You are responsible for any taxes on amounts you receive.',
      ],
    },
    {
      title: '9. Donations',
      paragraphs: [
        'You may choose to donate to support the Service. Donations are voluntary gifts, are non-refundable, and buy nothing: no goods, services, features, or influence over listings. Unless we expressly tell you otherwise in writing, we are not a registered charity and donations are not tax-deductible.',
        'Card and wallet donations are processed by Stripe under Stripe\'s own terms; we never see your full card number. Donations sent by Cash App or Zelle are transfers you make through those services under their terms.',
      ],
    },
    {
      title: '10. Partner banners and businesses',
      paragraphs: [
        'Some listings show a labelled partner banner from the business that hosts the restroom, which may suggest items for sale. A partner banner is a courtesy message from that business. It is not our endorsement, and we are not a party to any purchase you make. The business alone is responsible for its premises, products, prices and conduct.',
        'Businesses that appear in the Service are not our partners, agents or affiliates unless a partner banner says so, and even then they remain independent third parties.',
      ],
    },
    {
      title: '11. Third-party services',
      paragraphs: [
        'The Service uses third-party services that have their own terms and privacy policies, including OpenStreetMap and its Nominatim geocoding service (address search and business look-ups), Apple and Google (sign-in, maps and navigation hand-off), Stripe (payments and payouts), and Cash App and Zelle (transfers you or we initiate). We do not control these services and are not responsible for them.',
      ],
    },
    {
      title: '12. Intellectual property and ownership',
      paragraphs: [
        'The Service — including its software, design, text, graphics, logos, layouts, data compilations, amenity taxonomy, and all other materials other than Your Content — is owned by {{copyrightOwner}} and protected by copyright, trademark, trade-secret and other laws. © {{copyrightYears}} {{copyrightOwner}}{{copyrightLocationSuffix}}. All rights reserved.',
        '{{trademark}} and the {{appName}} logo are {{trademarkStatusPhrase}} of {{copyrightOwner}}. You may not use them without prior written permission.',
        '{{patentSentence}}',
        'Except for the limited right to use the Service on your own device for its intended purpose, no license or right is granted to you. You may not copy, modify, distribute, sell, lease, reverse-engineer, scrape, or create derivative works from any part of the Service.',
      ],
    },
    {
      title: '13. Prohibited uses',
      paragraphs: [
        'You agree not to: submit false, misleading or duplicate places, reports or reviews; claim credits you did not earn; harass, threaten or defame anyone, including business owners and staff; upload unlawful, sexual, violent or hateful material; upload images of people without their consent, or any image taken inside a restroom while a person was present; trespass or break any law while contributing; interfere with the Service or its security; use automated tools to access or scrape the Service; or use the Service for any commercial purpose we have not approved in writing.',
      ],
    },
    {
      title: '14. Suspension and termination',
      paragraphs: [
        'We may suspend or terminate your access, remove Your Content, and withhold or reverse unpaid credits at any time if we believe you have breached this Agreement, acted unlawfully or unsafely, or created risk for us, other users or third parties. You may stop using the Service at any time. Sections 5, 7, 8, 12, 15, 16 and 17 survive termination.',
      ],
    },
    {
      title: '15. Disclaimer of warranties',
      paragraphs: [
        'THE SERVICE AND ALL CONTENT ARE PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTY OF ANY KIND. TO THE FULLEST EXTENT PERMITTED BY LAW, WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, NON-INFRINGEMENT, ACCURACY, AND ANY WARRANTY ARISING FROM COURSE OF DEALING OR USAGE. WE DO NOT WARRANT THAT ANY LISTING IS ACCURATE OR SAFE, THAT THE SERVICE WILL BE UNINTERRUPTED OR ERROR-FREE, OR THAT DEFECTS WILL BE CORRECTED.',
      ],
    },
    {
      title: '16. Limitation of liability',
      paragraphs: [
        'TO THE FULLEST EXTENT PERMITTED BY LAW, THE RELEASED PARTIES WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF PROFITS, DATA, GOODWILL OR OPPORTUNITY, OR FOR PERSONAL INJURY, DEATH OR PROPERTY DAMAGE, ARISING OUT OF OR RELATING TO THE SERVICE, ANY LISTING, ANY LOCATION YOU VISIT, OR THIS AGREEMENT, HOWEVER CAUSED AND UNDER ANY THEORY OF LIABILITY, EVEN IF WE WERE ADVISED OF THE POSSIBILITY.',
        'TO THE FULLEST EXTENT PERMITTED BY LAW, THE TOTAL LIABILITY OF THE RELEASED PARTIES FOR ALL CLAIMS RELATING TO THE SERVICE OR THIS AGREEMENT WILL NOT EXCEED THE GREATER OF (A) THE TOTAL CREDITS WE ACTUALLY PAID YOU IN THE TWELVE MONTHS BEFORE THE CLAIM AROSE, OR (B) TEN U.S. DOLLARS (US$10).',
        'Some jurisdictions do not allow certain exclusions or limitations. In those jurisdictions, our liability is limited to the fullest extent permitted by law.',
      ],
    },
    {
      title: '17. Governing law and disputes',
      paragraphs: [
        'This Agreement is governed by the laws of {{jurisdiction}}, without regard to conflict-of-law rules. Before filing any claim, you agree to contact us at {{contactEmail}} and to try in good faith to resolve the dispute informally for at least thirty (30) days. Any claim not resolved informally must be brought in the state or federal courts located in {{jurisdiction}}, and you consent to their jurisdiction, except that either party may seek injunctive relief in any court of competent jurisdiction to protect intellectual property.',
        'To the extent permitted by law, any claim must be brought within one (1) year after it arises, and you waive any right to participate in a class or representative action against us.',
      ],
    },
    {
      title: '18. General',
      paragraphs: [
        'If any part of this Agreement is found unenforceable, the rest remains in effect and the unenforceable part is enforced to the maximum extent permitted. Our failure to enforce a provision is not a waiver. You may not assign this Agreement; we may assign it in connection with a transfer of the Service. This Agreement, with the documents it incorporates, is the entire agreement between you and us about the Service.',
      ],
    },
    {
      title: '19. Contact',
      paragraphs: [
        'Questions about these Terms: {{contactEmail}}.',
      ],
    },
  ],
};

const PRIVACY_POLICY = {
  key:   LEGAL_DOCS.PRIVACY,
  title: 'Privacy Policy',
  intro: 'Effective {{effectiveDate}}. This Privacy Policy explains what information {{entity}} ("we", "us") collects through the {{appName}} app, how we use it, and the choices you have.',
  sections: [
    {
      title: '1. Information we collect',
      paragraphs: [
        'Account information. If you sign in with Apple or Google, we receive the identifier those services provide and, if you allow it, your name and email address. If you continue as a guest we store no account details.',
        'Device identifier. The app creates a random identifier stored on your device so your submissions, saved places and credits can be attributed to you. It is not tied to your name unless you sign in.',
        'Location. With your permission, the app uses your device location while it is open to show nearby places, distances, and to pre-fill an address when you add a place. We do not track your location in the background.',
        'Content you submit. Places, "no public restroom" reports, amenity selections, ratings, review text, notes, photos and suggested amenities.',
        'Payout details. If you choose to receive credits, we store the payout method you select: your Stripe Connect account status (Stripe holds your banking details, not us), or the $Cashtag or Zelle email address or phone number you enter, and the name you provide.',
        'Donations. If you donate by card or wallet, Stripe processes the payment and we receive a payment reference and amount. We never receive or store your full card number.',
        'Co-branding contact details. For businesses, an administrator may look up publicly available business information on OpenStreetMap and may record business contact details and outreach notes.',
      ],
    },
    {
      title: '2. How we use information',
      paragraphs: [
        'To operate the Service: show places, distances and reviews; attribute your submissions; verify reports; approve and pay credits; record donations; and keep the map accurate.',
        'To moderate: submissions may be screened by automated systems, including AI models run on servers we operate, and by human moderators, to detect content that violates our rules.',
        'To communicate: activity notifications inside the app about your submissions, credits and account.',
        'To protect the Service: detecting fraud, duplicate or false submissions, and abuse; enforcing our terms; complying with law.',
      ],
    },
    {
      title: '3. Public content',
      paragraphs: [
        'Places, reports, ratings, review text and photos that pass moderation are public and visible to every user. Do not include personal information about yourself or anyone else in a review or photo. Reviews are shown without your name; they are attributed as coming from a user of the app.',
        'We may share your public reviews and amenity selections, as they appear in the app, with the business the listing concerns — for example when we invite a business to partner with us.',
      ],
    },
    {
      title: '4. When we share information',
      paragraphs: [
        'Service providers: OpenStreetMap\'s Nominatim service receives the address text you search for and coordinates you look up; Apple and Google provide sign-in and receive whatever their sign-in flows require; Stripe processes donations and contributor payouts under its own privacy policy; our own servers store uploaded photos and run content moderation.',
        'Legal and safety: we may disclose information when required by law, legal process, or to protect the rights, property or safety of users, the public, or us.',
        'Business transfer: if the Service is sold or transferred, information may be transferred with it, subject to this policy.',
        'We do not sell your personal information.',
      ],
    },
    {
      title: '5. Retention and deletion',
      paragraphs: [
        'Local data stays on your device until you clear it in Profile or remove the app. Content you have made public may remain in the Service after you stop using it because other users rely on it. Payout and donation records are kept as long as required for accounting and tax purposes.',
        'To request access to, correction of, or deletion of your information, contact {{contactEmail}}. We will respond as required by applicable law.',
      ],
    },
    {
      title: '6. Your choices',
      paragraphs: [
        'You can deny or revoke location and camera permissions in your device settings (some features will stop working). You can sign out at any time, remove your payout method, or use the app as a guest.',
      ],
    },
    {
      title: '7. Children',
      paragraphs: [
        'The Service is not directed to children under {{minimumAge}}, and we do not knowingly collect personal information from them. Contributing and receiving credits requires you to be at least {{contributorMinimumAge}}. If you believe a child has provided us information, contact {{contactEmail}} and we will delete it.',
      ],
    },
    {
      title: '8. Security',
      paragraphs: [
        'We use reasonable measures to protect information, including keeping payment secrets on our servers rather than in the app. No method of transmission or storage is completely secure, and we cannot guarantee absolute security.',
      ],
    },
    {
      title: '9. Where information is processed',
      paragraphs: [
        'The Service is operated from {{jurisdiction}}. If you use it from elsewhere, your information may be transferred to and processed there.',
      ],
    },
    {
      title: '10. Changes to this policy',
      paragraphs: [
        'We may update this policy. The app will show the new version and ask you to accept it before continuing.',
      ],
    },
    {
      title: '11. Contact',
      paragraphs: [
        'Privacy questions or requests: {{contactEmail}}.',
      ],
    },
  ],
};

const CONTRIBUTOR_TERMS = {
  key:   LEGAL_DOCS.CONTRIBUTOR,
  title: 'Contributor Payout & Safety Terms',
  intro: 'Effective {{effectiveDate}}. These Contributor Terms apply whenever you add a place, submit a "No public restroom" report, write a review, upload a photo, or take part in the contributor credit program. They are part of the Terms of Service.',
  sections: [
    {
      title: '1. You participate voluntarily and on your own behalf',
      paragraphs: [
        'Contributing is entirely voluntary. You decide whether, when, where and how to visit any location. Nothing in the Service asks, directs, schedules or requires you to go anywhere.',
        'You are not an employee, contractor, agent, volunteer, partner or representative of {{entity}}. You have no authority to act or speak on our behalf, and you must not tell anyone that you are working for us or inspecting on our behalf. We do not supervise, train, equip or insure you.',
      ],
    },
    {
      title: '2. Eligibility',
      paragraphs: [
        'You must be at least {{contributorMinimumAge}} years old (or the age of majority where you live, if higher), legally able to enter into a binding agreement, and not barred from the program. You may hold one contributor profile. You must provide accurate information about yourself and your payout method.',
      ],
    },
    {
      title: '3. How credits work',
      paragraphs: [
        'A credit of {{payoutAmount}} may be offered for each qualifying contribution. Currently a contribution qualifies when you (a) add a new place that is not already listed and submit a review of it that meets the minimum rating, text-length and amenity requirements shown in the app, or (b) submit a "No public restroom" report for an address that an administrator verifies.',
        'Every credit is subject to administrator review and approval at our sole discretion. We may decline a credit if a submission is inaccurate, a duplicate, low quality, incomplete, appears to have been made without visiting the location, violates these terms, or for any other reasonable cause. Approval can take time, and approval is not a guarantee of payment until the payout is actually sent.',
        'The qualification rules, the credit amount, and the program itself may be changed, suspended or ended at any time without notice. Credits have no cash value until paid, cannot be transferred, and expire if we cannot pay you within twelve (12) months because you have not provided a working payout method.',
        'Credits are a discretionary program payment. They are not wages, a salary, a fee for services, or an offer of employment.',
      ],
    },
    {
      title: '4. Payout methods',
      paragraphs: [
        'Stripe. If you choose Stripe, you will complete Stripe\'s onboarding and agree to Stripe\'s terms; Stripe may require identity information. Payouts are sent to your Stripe account and then to your bank on Stripe\'s schedule.',
        'Cash App or Zelle. If you choose Cash App or Zelle, you must enter the exact $Cashtag, email address or mobile number enrolled with that service, and the name on the account. Payments are sent by us from our own account using the details you provided. You are solely responsible for their accuracy. A payment sent to details you entered incorrectly is treated as paid and cannot be recovered or re-sent by us.',
        'Third-party fees, limits, holds and availability are set by those services, not by us. We do not offer payment in cash or by any method not listed in the app.',
      ],
    },
    {
      title: '5. Taxes',
      paragraphs: [
        'You are responsible for any taxes on amounts you receive. Where the law requires, we may ask you for tax information before paying you and may report payments to tax authorities. We do not provide tax advice.',
      ],
    },
    {
      title: '6. Safety and conduct rules — you must follow these',
      paragraphs: [
        'Obey the law and every posted rule. Only enter areas that are open to the public, during business hours. Never enter staff-only, private, closed, fenced, or restricted areas. Do not climb, force, prop, or bypass any door, gate, lock or barrier.',
        'Leave immediately and politely if asked by an owner, employee, security or the police. Do not argue, film, or return. A location that asks you to leave is not a place to contribute.',
        'Never photograph any person. Never take a photo of or inside a restroom while anyone else is present or could enter. Photograph fixtures and signage only.',
        'Do not use the app while driving or riding. Park legally. Cross streets safely. Be aware of your surroundings, especially at night or in unfamiliar areas, and do not go anywhere you feel unsafe.',
        'Do not contribute while impaired by alcohol or drugs. Do not bring minors along to contribute. Do not carry out contributions as part of a job, dare, race or competition.',
        'Be honest. Report only what you saw with your own eyes at the time of your visit. Never submit a place, report or review for a location you did not visit.',
      ],
    },
    {
      title: '7. Assumption of risk',
      paragraphs: [
        'You understand that travelling to, entering, evaluating, photographing and reviewing locations, and interacting with the people there, involve real risks that we cannot control or eliminate, including: motor-vehicle, bicycle and pedestrian accidents; slips, trips and falls; wet floors, poor lighting, broken fixtures and unsanitary conditions; exposure to bodily fluids, bacteria, viruses and other health hazards; assault, theft, harassment and other criminal acts; confrontation with owners, staff, security or members of the public; accusations of trespass, loitering or misconduct; police involvement, citations, fines and arrest; damage to your property; weather and environmental hazards; and physical or emotional injury, illness, disability or death.',
        'YOU KNOWINGLY AND VOLUNTARILY ASSUME ALL OF THESE RISKS AND ANY OTHER RISK, KNOWN OR UNKNOWN, FORESEEABLE OR NOT, THAT ARISES FROM YOUR CONTRIBUTOR ACTIVITIES, WHETHER OR NOT CAUSED IN WHOLE OR PART BY THE ORDINARY NEGLIGENCE OF ANY RELEASED PARTY, TO THE FULLEST EXTENT PERMITTED BY LAW.',
      ],
    },
    {
      title: '8. Release and waiver of claims',
      paragraphs: [
        'IN EXCHANGE FOR BEING ALLOWED TO CONTRIBUTE AND TO TAKE PART IN THE CREDIT PROGRAM, YOU, FOR YOURSELF AND YOUR HEIRS, EXECUTORS, ADMINISTRATORS, INSURERS AND ASSIGNS, HEREBY RELEASE, WAIVE, DISCHARGE AND COVENANT NOT TO SUE {{entity}} AND ITS OWNERS, OFFICERS, DIRECTORS, EMPLOYEES, AGENTS, CONTRACTORS, LICENSORS, SUCCESSORS AND ASSIGNS (THE "RELEASED PARTIES") FROM AND FOR ANY AND ALL CLAIMS, DEMANDS, ACTIONS, CAUSES OF ACTION, LOSSES, DAMAGES, LIABILITIES, COSTS AND EXPENSES OF ANY KIND, WHETHER IN CONTRACT, TORT (INCLUDING NEGLIGENCE), STATUTE OR OTHERWISE, ARISING OUT OF OR IN ANY WAY CONNECTED WITH YOUR CONTRIBUTOR ACTIVITIES, INCLUDING (A) ANYTHING THAT HAPPENS TO YOU, YOUR PROPERTY, OR ANY PERSON ACCOMPANYING YOU, AND (B) ANYTHING YOU DO OR CAUSE TO HAPPEN TO ANY OTHER PERSON, BUSINESS OR PROPERTY, WHILE TRAVELLING TO, VISITING, OR LEAVING ANY LOCATION OR WHILE PREPARING OR MAKING A SUBMISSION.',
        'This release does not apply to liability that cannot lawfully be released, including liability for gross negligence, wilful misconduct or fraud by a Released Party.',
      ],
    },
    {
      title: '9. Indemnification',
      paragraphs: [
        'You agree to defend, indemnify and hold harmless the Released Parties from and against any and all claims, demands, suits, proceedings, losses, liabilities, damages, judgments, settlements, fines, penalties, costs and expenses (including reasonable attorneys\' fees) brought or incurred by any person, business or authority that arise out of or relate to: (a) your presence at or conduct in, around or on the way to or from any location; (b) any injury, death, or property damage you cause or are alleged to have caused; (c) any trespass, nuisance, disturbance, or violation of law or posted rules; (d) any photo, review, report or other content you submit, including claims of defamation, privacy violation, or infringement; (e) any inaccurate or fraudulent submission; or (f) your breach of these terms. We may control the defence of any such claim at your expense, and you must not settle any claim that imposes obligations on us without our written consent.',
      ],
    },
    {
      title: '10. Locations are controlled by others; we owe you no duty of care',
      paragraphs: [
        'Every location in the Service is owned and controlled by someone else. We have not inspected any of them and have no knowledge of their condition, rules or the people there. We have no duty to warn you about any location, to make any location safe, or to check on you. You alone decide whether a location is safe and appropriate for you to visit.',
      ],
    },
    {
      title: '11. Accuracy, fraud and recovery',
      paragraphs: [
        'Submitting a place, report or review you know or should know is false, for a location you did not visit, or in someone else\'s name, is a breach of these terms. We may remove your content, cancel unpaid credits, ban you from the program and the Service, and recover any amount already paid to you for a fraudulent submission, plus our reasonable costs of recovery.',
      ],
    },
    {
      title: '12. Your content',
      paragraphs: [
        'The content license, representations and moderation rules in Section 5 of the Terms of Service apply to everything you submit as a contributor.',
      ],
    },
    {
      title: '13. Survival, severability and acknowledgment',
      paragraphs: [
        'Sections 1, 3, 5, 7, 8, 9, 10 and 11 survive the end of your participation and any termination of your account. If any provision is held unenforceable, it will be enforced to the maximum extent permitted and the rest remains in effect.',
        'BY ADDING A PLACE, SUBMITTING A REPORT OR REVIEW, OR ACCEPTING A CREDIT, YOU CONFIRM THAT YOU HAVE READ THESE CONTRIBUTOR TERMS, UNDERSTAND THAT YOU ARE GIVING UP SUBSTANTIAL LEGAL RIGHTS, INCLUDING THE RIGHT TO SUE, AND AGREE TO THEM FREELY AND VOLUNTARILY.',
      ],
    },
  ],
};

const COMMUNITY_GUIDELINES = {
  key:   LEGAL_DOCS.GUIDELINES,
  title: 'Community Guidelines',
  intro: 'These guidelines keep {{appName}} useful and safe for everyone. They are part of the Terms of Service.',
  sections: [
    {
      title: 'Be accurate',
      paragraphs: [
        'Only add places and reports for locations you visited yourself. Mark the amenities you actually saw. If something has changed since your visit, say so in a new review rather than editing history.',
      ],
    },
    {
      title: 'Be respectful',
      paragraphs: [
        'Review the restroom, not the people. No insults, threats, discrimination, or personal attacks on owners, staff or other users. Businesses that open their restrooms to the public are doing everyone a favour — treat them that way, and consider supporting them with a purchase.',
      ],
    },
    {
      title: 'Protect privacy',
      paragraphs: [
        'Never photograph people. Never photograph inside a restroom while anyone is present. Do not post names, phone numbers, licence plates or any other personal information about anyone.',
      ],
    },
    {
      title: 'Keep it on topic',
      paragraphs: [
        'No advertising, spam, political or religious messaging, sexual content, or content unrelated to finding and rating restrooms.',
      ],
    },
    {
      title: 'Stay safe and lawful',
      paragraphs: [
        'Follow the Contributor Terms safety rules every time. If a location feels unsafe or you are asked to leave, leave. No submission is worth a confrontation or an injury.',
      ],
    },
    {
      title: 'Consequences',
      paragraphs: [
        'Content that breaks these guidelines may be hidden or removed, credits may be declined, and repeat or serious violations may lead to a permanent ban.',
      ],
    },
  ],
};

export const LEGAL_DOCUMENTS = {
  [LEGAL_DOCS.TERMS]:       TERMS_OF_SERVICE,
  [LEGAL_DOCS.PRIVACY]:     PRIVACY_POLICY,
  [LEGAL_DOCS.CONTRIBUTOR]: CONTRIBUTOR_TERMS,
  [LEGAL_DOCS.GUIDELINES]:  COMMUNITY_GUIDELINES,
};

// ---------------------------------------------------------------------------
// The short acknowledgment shown before a user's first Add Place
// ---------------------------------------------------------------------------
export const CONTRIBUTOR_ACK_POINTS = [
  'I am at least {{contributorMinimumAge}} and I am adding this place voluntarily, on my own behalf — not for or on behalf of {{entity}}.',
  'I will obey the law and posted rules, stay in public areas, and leave if asked. I will not photograph people or photograph inside a restroom while anyone is present.',
  'I accept all risks of visiting locations, and I release {{entity}} from, and will indemnify it against, anything that happens to me or that I cause while contributing.',
  'I understand credits are approved at the administrator\'s discretion and are not wages.',
];

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
/**
 * renderLegalDoc(docKey, appSettings) → { key, title, intro, sections:[{title, paragraphs}] }
 * with every token filled in. Paragraphs that render to an empty string (for
 * example the patent sentence when no patent notice is configured) are dropped.
 */
export function renderLegalDoc(docKey, appSettings = {}) {
  const doc = LEGAL_DOCUMENTS[docKey];
  if (!doc) return null;
  const base = buildLegalContext(appSettings);
  const ctx = {
    ...base,
    copyrightLocationSuffix: base.copyrightLocation ? `, ${base.copyrightLocation}` : '',
    patentSentence: base.patentNotice
      ? `${base.patentNotice}${base.patentNumbers ? ` (${base.patentNumbers})` : ''}. Aspects of the Service may be the subject of pending or issued patents; no patent license is granted by this Agreement.`
      : '',
  };
  return {
    key:   doc.key,
    title: renderLegalTokens(doc.title, ctx),
    intro: renderLegalTokens(doc.intro, ctx),
    sections: doc.sections.map((section) => ({
      title:      renderLegalTokens(section.title, ctx),
      paragraphs: section.paragraphs.map((p) => renderLegalTokens(p, ctx).trim()).filter((p) => p !== ''),
    })),
  };
}

export function renderContributorAckPoints(appSettings = {}) {
  const ctx = buildLegalContext(appSettings);
  return CONTRIBUTOR_ACK_POINTS.map((p) => renderLegalTokens(p, ctx));
}

/**
 * needsLegalAcceptance(acceptance) — true when nothing was accepted or an
 * older version was.
 */
export const needsLegalAcceptance = (acceptance) => !acceptance || acceptance.version !== LEGAL_VERSION;
