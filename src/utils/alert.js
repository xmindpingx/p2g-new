// places2go — Alert helper (iOS / Android)
// Copyright © 2026–2027 Chris Gavan, Arizona. All rights reserved. Patent pending.
// showAlert(title, message?, buttons?, options?) has the same signature as
// React Native's Alert.alert. On the web react-native-web's Alert is an empty
// stub (nothing is shown and no button callback ever runs), so alert.web.js
// implements it with the browser's own dialogs.
import { Alert } from 'react-native';

export function showAlert(title, message, buttons, options) {
  Alert.alert(title, message, buttons, options);
}
