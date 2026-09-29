// places2go — Co-branding constants
// Admin-only feature: partner with the businesses that host listed restrooms.
// For every place the admin can look up the business on OpenStreetMap, send a
// data-driven outreach message, and — once a partnership is agreed — configure
// a small partner banner that reminds visitors to support the business and
// lists the items the business chose to suggest.
//
// Default Mode: ON. The banner is a plain, labelled courtesy notice. No
// rewards, no points, no gamification attached to it.

// ---------------------------------------------------------------------------
// Partnership status (per place)
// ---------------------------------------------------------------------------
export const PARTNERSHIP_STATUS = {
  NOT_CONTACTED: 'not_contacted',
  CONTACTED:     'contacted',
  IN_DISCUSSION: 'in_discussion',
  ACTIVE:        'active',
  DECLINED:      'declined',
  PAUSED:        'paused',
};

export const PARTNERSHIP_STATUS_LABELS = {
  [PARTNERSHIP_STATUS.NOT_CONTACTED]: 'Not contacted',
  [PARTNERSHIP_STATUS.CONTACTED]:     'Contacted',
  [PARTNERSHIP_STATUS.IN_DISCUSSION]: 'In discussion',
  [PARTNERSHIP_STATUS.ACTIVE]:        'Active partner',
  [PARTNERSHIP_STATUS.DECLINED]:      'Declined',
  [PARTNERSHIP_STATUS.PAUSED]:        'Paused',
};

export const PARTNERSHIP_STATUS_ORDER = [
  PARTNERSHIP_STATUS.NOT_CONTACTED,
  PARTNERSHIP_STATUS.CONTACTED,
  PARTNERSHIP_STATUS.IN_DISCUSSION,
  PARTNERSHIP_STATUS.ACTIVE,
  PARTNERSHIP_STATUS.PAUSED,
  PARTNERSHIP_STATUS.DECLINED,
];

// ---------------------------------------------------------------------------
// Outreach log channels
// ---------------------------------------------------------------------------
export const OUTREACH_CHANNEL = {
  EMAIL:     'email',
  PHONE:     'phone',
  IN_PERSON: 'in_person',
  SHARE:     'share',   // sent through the device share sheet (SMS, mail app, etc.)
  OTHER:     'other',
};

export const OUTREACH_CHANNEL_LABELS = {
  [OUTREACH_CHANNEL.EMAIL]:     'Email',
  [OUTREACH_CHANNEL.PHONE]:     'Phone call',
  [OUTREACH_CHANNEL.IN_PERSON]: 'In person',
  [OUTREACH_CHANNEL.SHARE]:     'Shared from device',
  [OUTREACH_CHANNEL.OTHER]:     'Other',
};

export const OUTREACH_CHANNEL_ORDER = [
  OUTREACH_CHANNEL.EMAIL,
  OUTREACH_CHANNEL.PHONE,
  OUTREACH_CHANNEL.IN_PERSON,
  OUTREACH_CHANNEL.SHARE,
  OUTREACH_CHANNEL.OTHER,
];

// ---------------------------------------------------------------------------
// Field limits (the banner headline and item cap come from appSettings so the
// admin can change them at runtime; these are fixed input limits only)
// ---------------------------------------------------------------------------
export const COBRANDING_LIMITS = {
  itemNameMaxLength:        40,
  itemPriceMaxLength:       12,
  courtesyMessageMaxLength: 160,
  contactFieldMaxLength:    120,
  notesMaxLength:           600,
  outreachNoteMaxLength:    300,
};

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------
const makeId = (prefix) =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

/**
 * buildCoBrandingProfile(placeId) — the per-place record stored under
 * store.coBranding[placeId]. Created lazily the first time an admin opens a
 * listing in the Co-branding tab.
 */
export const buildCoBrandingProfile = (placeId) => {
  const now = new Date().toISOString();
  return {
    placeId,
    status: PARTNERSHIP_STATUS.NOT_CONTACTED,

    business: {
      // Exactly what OpenStreetMap returned for the chosen feature, or null
      // when no lookup has been run yet. Never edited by hand.
      lookup: null,
      // Admin-entered contact details (may be copied from the lookup).
      contactName:  '',
      contactEmail: '',
      contactPhone: '',
      website:      '',
    },

    banner: {
      enabled:          false,
      headline:         '',
      courtesyMessage:  '',   // '' → the app-wide default from appSettings is used
      items:            [],   // [{ id, name, price }]
      showOnDetails:    true,
      showOnNavigation: true,
    },

    outreachLog: [],          // [{ id, channel, templateKey, subject, note, sentAt, by }]
    notes:       '',

    createdAt: now,
    updatedAt: now,
  };
};

export const buildSuggestedItem = ({ name, price = '' }) => ({
  id:    makeId('item'),
  name:  (name || '').trim(),
  price: (price || '').trim(),
});

export const buildOutreachEntry = ({ channel, templateKey = null, subject = '', note = '', by }) => ({
  id:          makeId('outreach'),
  channel,
  templateKey,
  subject:     (subject || '').trim(),
  note:        (note || '').trim(),
  sentAt:      new Date().toISOString(),
  by,
});
