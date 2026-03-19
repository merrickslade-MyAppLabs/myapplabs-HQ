/**
 * Business information used in invoice PDFs and other documents.
 *
 * loadBusinessInfo() reads from the `app_settings` table in Supabase.
 * The Settings panel (Business Info section) writes to this table.
 * Falls back to DEFAULT_BUSINESS_INFO if the row is missing or the
 * fetch fails (e.g. no network, table not yet created).
 *
 * DO NOT reference these constants directly inside the PDF generator.
 * Always pass businessInfo as a parameter so the caller can inject
 * live values from Supabase.
 */

import { supabase } from '../supabase/client'

export const DEFAULT_BUSINESS_INFO = {
  name:                 'MyAppLabs Ltd',
  companiesHouseNumber: '',          // Editable via Settings → Business Info
  icoNumber:            'ZC104281',  // ICO registration — known value
  registeredAddress: {
    line1:    '',
    line2:    '',
    city:     '',
    postcode: '',
    country:  'England & Wales',
  },
  email:   '',
  website: '',
  bankDetails: {
    accountName:   '',
    sortCode:      '',
    accountNumber: '',
  },
  vatNumber: '',
}

/**
 * Load business info from the `app_settings` Supabase table.
 * Falls back to DEFAULT_BUSINESS_INFO on any error.
 *
 * @returns {Promise<typeof DEFAULT_BUSINESS_INFO>}
 */
export async function loadBusinessInfo() {
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('*')
      .single()

    if (error || !data) return { ...DEFAULT_BUSINESS_INFO }

    return {
      name:                 data.company_name           || DEFAULT_BUSINESS_INFO.name,
      companiesHouseNumber: data.companies_house_number || '',
      icoNumber:            data.ico_number             || DEFAULT_BUSINESS_INFO.icoNumber,
      registeredAddress: {
        line1:    data.address_line1    || '',
        line2:    data.address_line2    || '',
        city:     data.address_city     || '',
        postcode: data.address_postcode || '',
        country:  data.address_country  || 'England & Wales',
      },
      email:   data.contact_email || '',
      website: data.website       || '',
      bankDetails: {
        accountName:   data.bank_account_name  || '',
        sortCode:      data.bank_sort_code      || '',
        accountNumber: data.bank_account_number || '',
      },
      vatNumber: data.vat_number || '',
    }
  } catch {
    return { ...DEFAULT_BUSINESS_INFO }
  }
}
