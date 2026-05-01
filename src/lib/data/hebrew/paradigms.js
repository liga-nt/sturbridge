/**
 * Hebrew paradigm templates — model verb uses strong root √קטל.
 *
 * Verb form keys:
 *   sg/pl → "3m" | "3f" | "3c" (common) | "2m" | "2f" | "1c"
 *   "3c" = common plural (qatal-type); "3m"/"3f" = distinct (yiqtol-type)
 *
 * Noun/adj form keys:
 *   number (sg/pl/du) → state (abs/cst)
 *
 * Participle/infinitive:
 *   gender+number → form  (ms/fs/mp/fp for participle; single string for infinitive)
 */

export const paradigms = {

  // ── Qal ─────────────────────────────────────────────────────────────────────

  qal_qatal: {
    label: 'Qal Perfect',
    pos: 'verb', stem: 'qal', tense: 'qatal',
    forms: {
      sg: { '3m': 'קָטַל',      '3f': 'קָטְלָה',   '2m': 'קָטַלְתָּ',  '2f': 'קָטַלְתְּ',   '1c': 'קָטַלְתִּי' },
      pl: { '3c': 'קָטְלוּ',    '2m': 'קְטַלְתֶּם', '2f': 'קְטַלְתֶּן', '1c': 'קָטַלְנוּ'  }
    }
  },

  qal_yiqtol: {
    label: 'Qal Imperfect',
    pos: 'verb', stem: 'qal', tense: 'yiqtol',
    forms: {
      sg: { '3m': 'יִקְטֹל',    '3f': 'תִּקְטֹל',  '2m': 'תִּקְטֹל',   '2f': 'תִּקְטְלִי',  '1c': 'אֶקְטֹל'   },
      pl: { '3m': 'יִקְטְלוּ',  '3f': 'תִּקְטֹלְנָה', '2m': 'תִּקְטְלוּ', '2f': 'תִּקְטֹלְנָה', '1c': 'נִקְטֹל'   }
    }
  },

  qal_wayyiqtol: {
    label: 'Qal Waw-Consecutive',
    pos: 'verb', stem: 'qal', tense: 'wayyiqtol',
    forms: {
      sg: { '3m': 'וַיִּקְטֹל',  '3f': 'וַתִּקְטֹל', '2m': 'וַתִּקְטֹל',  '2f': 'וַתִּקְטְלִי', '1c': 'וָאֶקְטֹל' },
      pl: { '3m': 'וַיִּקְטְלוּ', '3f': 'וַתִּקְטֹלְנָה', '2m': 'וַתִּקְטְלוּ', '2f': 'וַתִּקְטֹלְנָה', '1c': 'וַנִּקְטֹל' }
    }
  },

  qal_weqatal: {
    label: 'Qal Waw-Consecutive Perfect',
    pos: 'verb', stem: 'qal', tense: 'weqatal',
    forms: {
      sg: { '3m': 'וְקָטַל',    '3f': 'וְקָטְלָה',  '2m': 'וְקָטַלְתָּ', '2f': 'וְקָטַלְתְּ',  '1c': 'וְקָטַלְתִּי' },
      pl: { '3c': 'וְקָטְלוּ',  '2m': 'וּקְטַלְתֶּם', '2f': 'וּקְטַלְתֶּן', '1c': 'וְקָטַלְנוּ' }
    }
  },

  qal_jussive: {
    label: 'Qal Jussive',
    pos: 'verb', stem: 'qal', tense: 'jussive',
    forms: {
      sg: { '3m': 'יִקְטֹל',   '3f': 'תִּקְטֹל'  },
      pl: { '3m': 'יִקְטְלוּ', '3f': 'תִּקְטֹלְנָה' }
    }
  },

  qal_cohortative: {
    label: 'Qal Cohortative',
    pos: 'verb', stem: 'qal', tense: 'cohortative',
    forms: {
      sg: { '1c': 'אֶקְטְלָה' },
      pl: { '1c': 'נִקְטְלָה' }
    }
  },

  qal_imperative: {
    label: 'Qal Imperative',
    pos: 'verb', stem: 'qal', tense: 'imperative',
    forms: {
      sg: { '2m': 'קְטֹל',  '2f': 'קִטְלִי'  },
      pl: { '2m': 'קִטְלוּ', '2f': 'קְטֹלְנָה' }
    }
  },

  qal_participle: {
    label: 'Qal Participle Active',
    pos: 'verb', stem: 'qal', tense: 'participle',
    forms: {
      ms: 'קֹטֵל', fs: 'קֹטֶלֶת', mp: 'קֹטְלִים', fp: 'קֹטְלוֹת'
    }
  },

  qal_infinitive_construct: {
    label: 'Qal Infinitive Construct',
    pos: 'verb', stem: 'qal', tense: 'infinitive_construct',
    forms: { form: 'קְטֹל' }
  },

  qal_infinitive_absolute: {
    label: 'Qal Infinitive Absolute',
    pos: 'verb', stem: 'qal', tense: 'infinitive_absolute',
    forms: { form: 'קָטוֹל' }
  },

  // ── Niphal ──────────────────────────────────────────────────────────────────

  niphal_qatal: {
    label: 'Niphal Perfect',
    pos: 'verb', stem: 'niphal', tense: 'qatal',
    forms: {
      sg: { '3m': 'נִקְטַל',    '3f': 'נִקְטְלָה',  '2m': 'נִקְטַלְתָּ', '2f': 'נִקְטַלְתְּ',  '1c': 'נִקְטַלְתִּי' },
      pl: { '3c': 'נִקְטְלוּ',  '2m': 'נִקְטַלְתֶּם', '2f': 'נִקְטַלְתֶּן', '1c': 'נִקְטַלְנוּ' }
    }
  },

  niphal_yiqtol: {
    label: 'Niphal Imperfect',
    pos: 'verb', stem: 'niphal', tense: 'yiqtol',
    forms: {
      sg: { '3m': 'יִקָּטֵל',   '3f': 'תִּקָּטֵל',  '2m': 'תִּקָּטֵל',   '2f': 'תִּקָּטְלִי',  '1c': 'אֶקָּטֵל'   },
      pl: { '3m': 'יִקָּטְלוּ', '3f': 'תִּקָּטַלְנָה', '2m': 'תִּקָּטְלוּ', '2f': 'תִּקָּטַלְנָה', '1c': 'נִקָּטֵל' }
    }
  },

  niphal_wayyiqtol: {
    label: 'Niphal Waw-Consecutive',
    pos: 'verb', stem: 'niphal', tense: 'wayyiqtol',
    forms: {
      sg: { '3m': 'וַיִּקָּטֵל',  '3f': 'וַתִּקָּטֵל' },
      pl: { '3m': 'וַיִּקָּטְלוּ', '3f': 'וַתִּקָּטַלְנָה' }
    }
  },

  niphal_jussive: {
    label: 'Niphal Jussive',
    pos: 'verb', stem: 'niphal', tense: 'jussive',
    forms: {
      sg: { '3m': 'יִקָּטֵל',   '3f': 'תִּקָּטֵל'  },
      pl: { '3m': 'יִקָּטְלוּ', '3f': 'תִּקָּטַלְנָה' }
    }
  },

  niphal_participle: {
    label: 'Niphal Participle',
    pos: 'verb', stem: 'niphal', tense: 'participle',
    forms: {
      ms: 'נִקְטָל', fs: 'נִקְטֶלֶת', mp: 'נִקְטָלִים', fp: 'נִקְטָלוֹת'
    }
  },

  // ── Piel ────────────────────────────────────────────────────────────────────

  piel_qatal: {
    label: 'Piel Perfect',
    pos: 'verb', stem: 'piel', tense: 'qatal',
    forms: {
      sg: { '3m': 'קִטֵּל',    '3f': 'קִטְּלָה',  '2m': 'קִטַּלְתָּ', '2f': 'קִטַּלְתְּ',  '1c': 'קִטַּלְתִּי' },
      pl: { '3c': 'קִטְּלוּ',  '2m': 'קִטַּלְתֶּם', '2f': 'קִטַּלְתֶּן', '1c': 'קִטַּלְנוּ' }
    }
  },

  piel_yiqtol: {
    label: 'Piel Imperfect',
    pos: 'verb', stem: 'piel', tense: 'yiqtol',
    forms: {
      sg: { '3m': 'יְקַטֵּל',   '3f': 'תְּקַטֵּל',  '2m': 'תְּקַטֵּל',   '2f': 'תְּקַטְּלִי',  '1c': 'אֲקַטֵּל'   },
      pl: { '3m': 'יְקַטְּלוּ', '3f': 'תְּקַטֵּלְנָה', '2m': 'תְּקַטְּלוּ', '2f': 'תְּקַטֵּלְנָה', '1c': 'נְקַטֵּל' }
    }
  },

  piel_wayyiqtol: {
    label: 'Piel Waw-Consecutive',
    pos: 'verb', stem: 'piel', tense: 'wayyiqtol',
    forms: {
      sg: { '3m': 'וַיְקַטֵּל',  '3f': 'וַתְּקַטֵּל' },
      pl: { '3m': 'וַיְקַטְּלוּ', '3f': 'וַתְּקַטֵּלְנָה' }
    }
  },

  piel_participle: {
    label: 'Piel Participle Active',
    pos: 'verb', stem: 'piel', tense: 'participle',
    forms: {
      ms: 'מְקַטֵּל', fs: 'מְקַטֶּלֶת', mp: 'מְקַטְּלִים', fp: 'מְקַטְּלוֹת'
    }
  },

  // ── Hiphil ──────────────────────────────────────────────────────────────────

  hiphil_qatal: {
    label: 'Hiphil Perfect',
    pos: 'verb', stem: 'hiphil', tense: 'qatal',
    forms: {
      sg: { '3m': 'הִקְטִיל',   '3f': 'הִקְטִילָה',  '2m': 'הִקְטַלְתָּ', '2f': 'הִקְטַלְתְּ',  '1c': 'הִקְטַלְתִּי' },
      pl: { '3c': 'הִקְטִילוּ', '2m': 'הִקְטַלְתֶּם', '2f': 'הִקְטַלְתֶּן', '1c': 'הִקְטַלְנוּ'  }
    }
  },

  hiphil_yiqtol: {
    label: 'Hiphil Imperfect',
    pos: 'verb', stem: 'hiphil', tense: 'yiqtol',
    forms: {
      sg: { '3m': 'יַקְטִיל',   '3f': 'תַּקְטִיל',  '2m': 'תַּקְטִיל',   '2f': 'תַּקְטִילִי',  '1c': 'אַקְטִיל'   },
      pl: { '3m': 'יַקְטִילוּ', '3f': 'תַּקְטֵלְנָה', '2m': 'תַּקְטִילוּ', '2f': 'תַּקְטֵלְנָה', '1c': 'נַקְטִיל'  }
    }
  },

  hiphil_wayyiqtol: {
    label: 'Hiphil Waw-Consecutive',
    pos: 'verb', stem: 'hiphil', tense: 'wayyiqtol',
    forms: {
      sg: { '3m': 'וַיַּקְטֵל',  '3f': 'וַתַּקְטֵל' },
      pl: { '3m': 'וַיַּקְטִילוּ', '3f': 'וַתַּקְטֵלְנָה' }
    }
  },

  hiphil_jussive: {
    label: 'Hiphil Jussive',
    pos: 'verb', stem: 'hiphil', tense: 'jussive',
    forms: {
      sg: { '3m': 'יַקְטֵל',   '3f': 'תַּקְטֵל'  },
      pl: { '3m': 'יַקְטִילוּ', '3f': 'תַּקְטֵלְנָה' }
    }
  },

  hiphil_imperative: {
    label: 'Hiphil Imperative',
    pos: 'verb', stem: 'hiphil', tense: 'imperative',
    forms: {
      sg: { '2m': 'הַקְטֵל',  '2f': 'הַקְטִילִי'  },
      pl: { '2m': 'הַקְטִילוּ', '2f': 'הַקְטֵלְנָה' }
    }
  },

  hiphil_participle: {
    label: 'Hiphil Participle Active',
    pos: 'verb', stem: 'hiphil', tense: 'participle',
    forms: {
      ms: 'מַקְטִיל', fs: 'מַקְטִילָה', mp: 'מַקְטִילִים', fp: 'מַקְטִילוֹת'
    }
  },

  hiphil_infinitive_construct: {
    label: 'Hiphil Infinitive Construct',
    pos: 'verb', stem: 'hiphil', tense: 'infinitive_construct',
    forms: { form: 'הַקְטִיל' }
  },

  // ── Hophal ──────────────────────────────────────────────────────────────────

  hophal_qatal: {
    label: 'Hophal Perfect',
    pos: 'verb', stem: 'hophal', tense: 'qatal',
    forms: {
      sg: { '3m': 'הָקְטַל' },
      pl: { '3c': 'הָקְטְלוּ' }
    }
  },

  hophal_yiqtol: {
    label: 'Hophal Imperfect',
    pos: 'verb', stem: 'hophal', tense: 'yiqtol',
    forms: {
      sg: { '3m': 'יָקְטַל' },
      pl: { '3m': 'יָקְטְלוּ' }
    }
  },

  hophal_wayyiqtol: {
    label: 'Hophal Waw-Consecutive',
    pos: 'verb', stem: 'hophal', tense: 'wayyiqtol',
    forms: {
      sg: { '3m': 'וַיָּקְטַל' },
      pl: { '3m': 'וַיָּקְטְלוּ' }
    }
  },

  // ── Hitpael ─────────────────────────────────────────────────────────────────

  hitpael_qatal: {
    label: 'Hitpael Perfect',
    pos: 'verb', stem: 'hitpael', tense: 'qatal',
    forms: {
      sg: { '3m': 'הִתְקַטֵּל',  '3f': 'הִתְקַטְּלָה', '2m': 'הִתְקַטַּלְתָּ', '1c': 'הִתְקַטַּלְתִּי' },
      pl: { '3c': 'הִתְקַטְּלוּ', '2m': 'הִתְקַטַּלְתֶּם', '1c': 'הִתְקַטַּלְנוּ' }
    }
  },

  hitpael_yiqtol: {
    label: 'Hitpael Imperfect',
    pos: 'verb', stem: 'hitpael', tense: 'yiqtol',
    forms: {
      sg: { '3m': 'יִתְקַטֵּל',  '3f': 'תִּתְקַטֵּל',  '1c': 'אֶתְקַטֵּל'  },
      pl: { '3m': 'יִתְקַטְּלוּ', '3f': 'תִּתְקַטֵּלְנָה', '1c': 'נִתְקַטֵּל' }
    }
  },

  hitpael_wayyiqtol: {
    label: 'Hitpael Waw-Consecutive',
    pos: 'verb', stem: 'hitpael', tense: 'wayyiqtol',
    forms: {
      sg: { '3m': 'וַיִּתְקַטֵּל', '3f': 'וַתִּתְקַטֵּל' },
      pl: { '3m': 'וַיִּתְקַטְּלוּ' }
    }
  },

  // ── Polel (rare) ────────────────────────────────────────────────────────────

  polel_yiqtol: {
    label: 'Polel Imperfect',
    pos: 'verb', stem: 'polel', tense: 'yiqtol',
    forms: {
      sg: { '3m': 'יְקוֹמֵם' },
      pl: { '3m': 'יְקוֹמְמוּ' }
    }
  },

  // ── Nouns ────────────────────────────────────────────────────────────────────

  noun_masc: {
    label: 'Masculine Noun',
    pos: 'noun', gender: 'masc',
  },

  noun_fem: {
    label: 'Feminine Noun',
    pos: 'noun', gender: 'fem',
  },

  noun_both: {
    label: 'Common Gender Noun',
    pos: 'noun', gender: 'both',
  },

  // ── Adjectives ───────────────────────────────────────────────────────────────

  adj_masc: {
    label: 'Adjective',
    pos: 'adj',
  },

  adj_fem: {
    label: 'Adjective (Feminine)',
    pos: 'adj',
  }
};
