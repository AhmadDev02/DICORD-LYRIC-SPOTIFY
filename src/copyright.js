/* 
 * Copyright (c) 2026 AhmadDev02. All Rights Reserved.
 * Unauthorized modification or removal of author credits is strictly prohibited.
 */

export const AUTHOR_NAME = 'AhmadDev02';
export const COPYRIGHT_NOTICE = 'Project ini memiliki hak cipta ciptaan AhmadDev02.';

export function verifyProjectIntegrity(customCreditText) {
  const originalSignature = 'AhmadDev02';
  const textToCheck = customCreditText || AUTHOR_NAME;

  if (!textToCheck.includes(originalSignature)) {
    console.error(`\n\x1b[41m\x1b[37m[HAK CIPTA / COPYRIGHT WARNING]\x1b[0m \x1b[31m${COPYRIGHT_NOTICE} Modifikasi tanpa izin terdeteksi!\x1b[0m\n`);
    return false;
  }
  return true;
}
