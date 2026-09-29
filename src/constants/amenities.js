// places2go — Amenity & Environment constants
// Single source of truth for all amenity keys, labels, groups, and flags.
// Every screen (Add Place form, Place Details, Map filters, Admin panel) imports
// from here. Never hard-code amenity strings anywhere else.

// ---------------------------------------------------------------------------
// Group identifiers — used for section headers and admin assignment picker
// ---------------------------------------------------------------------------
export const AMENITY_GROUPS = {
  ENVIRONMENT:  'environment',
  FACILITY:     'facility',
  ACCESSIBILITY:'accessibility',
  HYGIENE:      'hygiene',
  VENDING:      'vending',
  ACCESS:       'access',
  QUALITY:      'quality',
};

export const AMENITY_GROUP_LABELS = {
  [AMENITY_GROUPS.ENVIRONMENT]:   'Location & Environment',
  [AMENITY_GROUPS.FACILITY]:      'Facility Type',
  [AMENITY_GROUPS.ACCESSIBILITY]: 'Accessibility',
  [AMENITY_GROUPS.HYGIENE]:       'Fixtures & Hygiene',
  [AMENITY_GROUPS.VENDING]:       'Vending Products',
  [AMENITY_GROUPS.ACCESS]:        'Access & Hours',
  [AMENITY_GROUPS.QUALITY]:       'Quality Signals',
};

// Ordered list used for group section rendering
export const AMENITY_GROUP_ORDER = [
  AMENITY_GROUPS.ENVIRONMENT,
  AMENITY_GROUPS.FACILITY,
  AMENITY_GROUPS.ACCESSIBILITY,
  AMENITY_GROUPS.HYGIENE,
  AMENITY_GROUPS.VENDING,
  AMENITY_GROUPS.ACCESS,
  AMENITY_GROUPS.QUALITY,
];

// ---------------------------------------------------------------------------
// Master amenity list
// Shape: { key, label, group, isVending, isMapChip, mapChipOrder }
//   key          — camelCase, unique, used as object property on place.amenities
//   label        — human-readable display string
//   group        — one of AMENITY_GROUPS values
//   isVending    — true for items in the vending machine group
//   isMapChip    — true = shown as a one-touch filter chip on the map
//   mapChipOrder — sort order among map chips (lower = leftmost); null if not a chip
// ---------------------------------------------------------------------------
export const AMENITIES = [
  // ── Location & Environment ──────────────────────────────────────────────
  {
    key: 'isIndoor',
    label: 'Indoor',
    group: AMENITY_GROUPS.ENVIRONMENT,
    isVending: false,
    isMapChip: true,
    mapChipOrder: 6,
  },
  {
    key: 'isOutdoor',
    label: 'Outdoor',
    group: AMENITY_GROUPS.ENVIRONMENT,
    isVending: false,
    isMapChip: false,
    mapChipOrder: null,
  },
  {
    key: 'isCovered',
    label: 'Covered / Sheltered',
    group: AMENITY_GROUPS.ENVIRONMENT,
    isVending: false,
    isMapChip: false,
    mapChipOrder: null,
  },
  {
    key: 'isWellLit',
    label: 'Well Lit',
    group: AMENITY_GROUPS.ENVIRONMENT,
    isVending: false,
    isMapChip: false,
    mapChipOrder: null,
  },
  {
    key: 'isNaturalLight',
    label: 'Natural Light',
    group: AMENITY_GROUPS.ENVIRONMENT,
    isVending: false,
    isMapChip: false,
    mapChipOrder: null,
  },
  {
    key: 'isSafe',
    label: 'Feels Safe',
    group: AMENITY_GROUPS.ENVIRONMENT,
    isVending: false,
    isMapChip: false,
    mapChipOrder: null,
  },
  {
    key: 'isQuiet',
    label: 'Quiet / Low Traffic',
    group: AMENITY_GROUPS.ENVIRONMENT,
    isVending: false,
    isMapChip: false,
    mapChipOrder: null,
  },
  {
    key: 'isEasyToFind',
    label: 'Easy to Find',
    group: AMENITY_GROUPS.ENVIRONMENT,
    isVending: false,
    isMapChip: false,
    mapChipOrder: null,
  },
  {
    key: 'isEasyToAccess',
    label: 'Easy to Access',
    group: AMENITY_GROUPS.ENVIRONMENT,
    isVending: false,
    isMapChip: false,
    mapChipOrder: null,
  },
  {
    key: 'hasSignage',
    label: 'Clearly Signed',
    group: AMENITY_GROUPS.ENVIRONMENT,
    isVending: false,
    isMapChip: false,
    mapChipOrder: null,
  },
  {
    key: 'isOnGroundFloor',
    label: 'Ground Floor',
    group: AMENITY_GROUPS.ENVIRONMENT,
    isVending: false,
    isMapChip: false,
    mapChipOrder: null,
  },
  {
    key: 'hasElevatorAccess',
    label: 'Elevator Access',
    group: AMENITY_GROUPS.ENVIRONMENT,
    isVending: false,
    isMapChip: false,
    mapChipOrder: null,
  },
  {
    key: 'hasParking',
    label: 'Parking Nearby',
    group: AMENITY_GROUPS.ENVIRONMENT,
    isVending: false,
    isMapChip: false,
    mapChipOrder: null,
  },
  {
    key: 'isSecure',
    label: 'Secure / Monitored',
    group: AMENITY_GROUPS.ENVIRONMENT,
    isVending: false,
    isMapChip: false,
    mapChipOrder: null,
  },
  {
    key: 'hasAttendant',
    label: 'Attendant on Duty',
    group: AMENITY_GROUPS.ENVIRONMENT,
    isVending: false,
    isMapChip: false,
    mapChipOrder: null,
  },
  {
    key: 'hasGoodVentilation',
    label: 'Good Ventilation',
    group: AMENITY_GROUPS.ENVIRONMENT,
    isVending: false,
    isMapChip: false,
    mapChipOrder: null,
  },

  // ── Facility Type ────────────────────────────────────────────────────────
  {
    key: 'isSingleOccupancy',
    label: 'Single Stall',
    group: AMENITY_GROUPS.FACILITY,
    isVending: false,
    isMapChip: false,
    mapChipOrder: null,
  },
  {
    key: 'isMultiStall',
    label: 'Multi-Stall',
    group: AMENITY_GROUPS.FACILITY,
    isVending: false,
    isMapChip: false,
    mapChipOrder: null,
  },
  {
    key: 'isGenderNeutral',
    label: 'Gender Neutral',
    group: AMENITY_GROUPS.FACILITY,
    isVending: false,
    isMapChip: false,
    mapChipOrder: null,
  },
  {
    key: 'hasMensRoom',
    label: "Men's Room",
    group: AMENITY_GROUPS.FACILITY,
    isVending: false,
    isMapChip: false,
    mapChipOrder: null,
  },
  {
    key: 'hasWomensRoom',
    label: "Women's Room",
    group: AMENITY_GROUPS.FACILITY,
    isVending: false,
    isMapChip: false,
    mapChipOrder: null,
  },
  {
    key: 'hasFamilyRoom',
    label: 'Family Room',
    group: AMENITY_GROUPS.FACILITY,
    isVending: false,
    isMapChip: false,
    mapChipOrder: null,
  },
  {
    key: 'hasChangingStation',
    label: 'Changing Table',
    group: AMENITY_GROUPS.FACILITY,
    isVending: false,
    isMapChip: false,
    mapChipOrder: null,
  },
  {
    key: 'hasKidSizedToilet',
    label: 'Kid-Sized Toilet',
    group: AMENITY_GROUPS.FACILITY,
    isVending: false,
    isMapChip: false,
    mapChipOrder: null,
  },
  {
    key: 'hasNursingArea',
    label: 'Nursing / Lactation Area',
    group: AMENITY_GROUPS.FACILITY,
    isVending: false,
    isMapChip: false,
    mapChipOrder: null,
  },

  // ── Accessibility ────────────────────────────────────────────────────────
  {
    key: 'hasWheelchairStall',
    label: 'Wheelchair Stall',
    group: AMENITY_GROUPS.ACCESSIBILITY,
    isVending: false,
    isMapChip: false,
    mapChipOrder: null,
  },
  {
    key: 'hasGrabBars',
    label: 'Grab Bars',
    group: AMENITY_GROUPS.ACCESSIBILITY,
    isVending: false,
    isMapChip: false,
    mapChipOrder: null,
  },
  {
    key: 'hasLowSink',
    label: 'Lowered Sink',
    group: AMENITY_GROUPS.ACCESSIBILITY,
    isVending: false,
    isMapChip: false,
    mapChipOrder: null,
  },
  {
    key: 'hasAutoDoor',
    label: 'Auto Door / No-Touch Entry',
    group: AMENITY_GROUPS.ACCESSIBILITY,
    isVending: false,
    isMapChip: false,
    mapChipOrder: null,
  },
  {
    key: 'hasBrailleSignage',
    label: 'Braille / Audio Signage',
    group: AMENITY_GROUPS.ACCESSIBILITY,
    isVending: false,
    isMapChip: false,
    mapChipOrder: null,
  },
  {
    key: 'hasStepFreeEntry',
    label: 'Step-Free Entry',
    group: AMENITY_GROUPS.ACCESSIBILITY,
    isVending: false,
    isMapChip: false,
    mapChipOrder: null,
  },

  // ── Fixtures & Hygiene ───────────────────────────────────────────────────
  {
    key: 'hasSoap',
    label: 'Soap',
    group: AMENITY_GROUPS.HYGIENE,
    isVending: false,
    isMapChip: false,
    mapChipOrder: null,
  },
  {
    key: 'hasHotWater',
    label: 'Hot Water',
    group: AMENITY_GROUPS.HYGIENE,
    isVending: false,
    isMapChip: false,
    mapChipOrder: null,
  },
  {
    key: 'hasPaperTowels',
    label: 'Paper Towels',
    group: AMENITY_GROUPS.HYGIENE,
    isVending: false,
    isMapChip: false,
    mapChipOrder: null,
  },
  {
    key: 'hasHandDryer',
    label: 'Hand Dryer',
    group: AMENITY_GROUPS.HYGIENE,
    isVending: false,
    isMapChip: false,
    mapChipOrder: null,
  },
  {
    key: 'hasToiletPaper',
    label: 'Toilet Paper',
    group: AMENITY_GROUPS.HYGIENE,
    isVending: false,
    isMapChip: false,
    mapChipOrder: null,
  },
  {
    key: 'hasSeatCovers',
    label: 'Seat Covers',
    group: AMENITY_GROUPS.HYGIENE,
    isVending: false,
    isMapChip: false,
    mapChipOrder: null,
  },
  {
    key: 'hasBidet',
    label: 'Bidet',
    group: AMENITY_GROUPS.HYGIENE,
    isVending: false,
    isMapChip: false,
    mapChipOrder: null,
  },
  {
    key: 'hasFemininePad',
    label: 'Free Pads & Tampons',
    group: AMENITY_GROUPS.HYGIENE,
    isVending: false,
    isMapChip: false,
    mapChipOrder: null,
  },
  {
    key: 'hasFeminineDisposal',
    label: 'Feminine Disposal Bin',
    group: AMENITY_GROUPS.HYGIENE,
    isVending: false,
    isMapChip: false,
    mapChipOrder: null,
  },
  {
    key: 'hasBabyWipes',
    label: 'Baby Wipes Dispenser',
    group: AMENITY_GROUPS.HYGIENE,
    isVending: false,
    isMapChip: false,
    mapChipOrder: null,
  },

  // ── Vending Products ─────────────────────────────────────────────────────
  {
    key: 'vendingCondoms',
    label: 'Condoms',
    group: AMENITY_GROUPS.VENDING,
    isVending: true,
    isMapChip: false,
    mapChipOrder: null,
  },
  {
    key: 'vendingFeminineProducts',
    label: 'Pads & Tampons',
    group: AMENITY_GROUPS.VENDING,
    isVending: true,
    isMapChip: false,
    mapChipOrder: null,
  },
  {
    key: 'vendingToothbrushKit',
    label: 'Toothbrush Kit',
    group: AMENITY_GROUPS.VENDING,
    isVending: true,
    isMapChip: false,
    mapChipOrder: null,
  },
  {
    key: 'vendingPainRelievers',
    label: 'Pain Relievers',
    group: AMENITY_GROUPS.VENDING,
    isVending: true,
    isMapChip: false,
    mapChipOrder: null,
  },
  {
    key: 'vendingDeodorant',
    label: 'Deodorant',
    group: AMENITY_GROUPS.VENDING,
    isVending: true,
    isMapChip: false,
    mapChipOrder: null,
  },
  {
    key: 'vendingSnacks',
    label: 'Snacks',
    group: AMENITY_GROUPS.VENDING,
    isVending: true,
    isMapChip: false,
    mapChipOrder: null,
  },
  {
    key: 'vendingPhoneCharger',
    label: 'Phone Charger / Cable',
    group: AMENITY_GROUPS.VENDING,
    isVending: true,
    isMapChip: false,
    mapChipOrder: null,
  },
  {
    key: 'vendingOther',
    label: 'Other Vending',
    group: AMENITY_GROUPS.VENDING,
    isVending: true,
    isMapChip: false,
    mapChipOrder: null,
  },

  // ── Access & Hours ───────────────────────────────────────────────────────
  {
    key: 'isFree',
    label: 'Free to Use',
    group: AMENITY_GROUPS.ACCESS,
    isVending: false,
    isMapChip: true,
    mapChipOrder: 5,
  },
  {
    key: 'requiresKey',
    label: 'Key Required',
    group: AMENITY_GROUPS.ACCESS,
    isVending: false,
    isMapChip: false,
    mapChipOrder: null,
  },
  {
    key: 'requiresPurchase',
    label: 'Purchase Required',
    group: AMENITY_GROUPS.ACCESS,
    isVending: false,
    isMapChip: false,
    mapChipOrder: null,
  },
  {
    key: 'requiresCode',
    label: 'Code / App Required',
    group: AMENITY_GROUPS.ACCESS,
    isVending: false,
    isMapChip: false,
    mapChipOrder: null,
  },
  {
    key: 'isOpen24Hours',
    label: 'Open 24 Hours',
    group: AMENITY_GROUPS.ACCESS,
    isVending: false,
    isMapChip: false,
    mapChipOrder: null,
  },

  // ── Quality Signals ──────────────────────────────────────────────────────
  {
    key: 'isClean',
    label: 'Reported Clean',
    group: AMENITY_GROUPS.QUALITY,
    isVending: false,
    isMapChip: true,
    mapChipOrder: 4,
  },
  {
    key: 'isWellMaintained',
    label: 'Well Maintained',
    group: AMENITY_GROUPS.QUALITY,
    isVending: false,
    isMapChip: false,
    mapChipOrder: null,
  },
  {
    key: 'hasAirFreshener',
    label: 'Air Freshener',
    group: AMENITY_GROUPS.QUALITY,
    isVending: false,
    isMapChip: false,
    mapChipOrder: null,
  },
];

// ---------------------------------------------------------------------------
// Derived structures — computed once at module load, imported wherever needed
// ---------------------------------------------------------------------------

// All official keys as a flat Set (fast membership check)
export const AMENITY_KEY_SET = new Set(AMENITIES.map((a) => a.key));

// Map chips sorted by mapChipOrder ascending
// Hardcoded "Nearby" and "Open Now" are positional UI-only chips handled by
// the map screen itself; the rest come from here.
export const MAP_CHIP_AMENITIES = AMENITIES.filter((a) => a.isMapChip).sort(
  (a, b) => a.mapChipOrder - b.mapChipOrder
);

// Keys grouped by group — used for Add Place form and Place Details sections
export const AMENITIES_BY_GROUP = AMENITY_GROUP_ORDER.reduce((acc, group) => {
  acc[group] = AMENITIES.filter((a) => a.group === group);
  return acc;
}, {});

// Quick label lookup by key — used in Place Details chips and admin panel
export const AMENITY_LABEL_BY_KEY = AMENITIES.reduce((acc, a) => {
  acc[a.key] = a.label;
  return acc;
}, {});

// Vending items only
export const VENDING_AMENITIES = AMENITIES.filter((a) => a.isVending);

// Non-vending amenities only
export const NON_VENDING_AMENITIES = AMENITIES.filter((a) => !a.isVending);

// ---------------------------------------------------------------------------
// Default amenity object — spread onto a new place to initialise all keys false
// ---------------------------------------------------------------------------
export const DEFAULT_AMENITIES = AMENITIES.reduce((acc, a) => {
  acc[a.key] = false;
  return acc;
}, {});

// ---------------------------------------------------------------------------
// User-submitted custom amenity
// ---------------------------------------------------------------------------
export const CUSTOM_AMENITY_STATUS = {
  PENDING:  'pending',   // submitted, awaiting admin review
  APPROVED: 'approved',  // promoted to official amenity
  REJECTED: 'rejected',  // dismissed by admin
};

// Max character length for a custom amenity name
export const CUSTOM_AMENITY_MAX_LABEL_LENGTH = 40;

// ---------------------------------------------------------------------------
// Admin — runtime official amenity shape (matches officialAmenities in store)
// ---------------------------------------------------------------------------
export const buildOfficialAmenity = ({
  key,
  label,
  group,
  isVending = false,
  addedBy = 'system',
}) => ({
  key,
  label,
  group,
  isVending,
  isMapChip: false,   // admin-added amenities never become map chips automatically
  mapChipOrder: null,
  isActive: true,
  addedBy,
  createdAt: new Date().toISOString(),
});

// Seed for officialAmenities in the store — mirrors AMENITIES above
export const OFFICIAL_AMENITIES_SEED = AMENITIES.map((a) => ({
  ...a,
  isActive: true,
  addedBy: 'system',
  createdAt: '2026-09-28T00:00:00.000Z',
}));
