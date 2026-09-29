// places2go — Stripe platform wrapper (web)
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// @stripe/stripe-react-native is native-only. On the web the provider is a
// pass-through and the PaymentSheet hooks return a "Failed" result with a
// clear message, so DonateScreen shows it instead of crashing.
import React from 'react';

export const PaymentSheetError = Object.freeze({ Canceled: 'Canceled', Failed: 'Failed', Timeout: 'Timeout' });

export function StripeProvider({ children }) {
  return <>{children}</>;
}

const WEB_ERROR = Object.freeze({
  code:    PaymentSheetError.Failed,
  message: 'Donations are not available in the web version. Please use the places2go mobile app.',
});

export function usePaymentSheet() {
  return {
    loading:             false,
    initPaymentSheet:    async () => ({ error: WEB_ERROR }),
    presentPaymentSheet: async () => ({ error: WEB_ERROR }),
    confirmPaymentSheetPayment: async () => ({ error: WEB_ERROR }),
    resetPaymentSheetCustomer:  async () => null,
  };
}
