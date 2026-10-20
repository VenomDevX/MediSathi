/** Local calendar date as YYYY-MM-DD ('en-CA' formats dates that way). */
export const todayLocal = (d = new Date()) => d.toLocaleDateString('en-CA')
