/* 
 * Copyright (c) 2026 Ahmad Fajar Alfaravi. All Rights Reserved.
 * Unauthorized modification or removal of author credits is strictly prohibited.
 */

export const AUTHOR_NAME = 'Ahmad Fajar Alfaravi';
export const COPYRIGHT_NOTICE = 'Project ini memiliki hak cipta ciptaan Ahmad Fajar Alfaravi.';

export function verifyProjectIntegrity(customCreditText) {
  const originalSignature = 'Ahmad Fajar Alfaravi';
  const textToCheck = customCreditText || AUTHOR_NAME;

  if (!textToCheck.includes(originalSignature)) {
    console.error(`\n\x1b[41m\x1b[37m[HAK CIPTA / COPYRIGHT WARNING]\x1b[0m \x1b[31m${COPYRIGHT_NOTICE} Modifikasi atau penghapusan kredit hak cipta tanpa izin dilarang!\x1b[0m\n`);
    return false;
  }
  return true;
}
