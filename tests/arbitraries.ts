import * as fc from "fast-check";

/** Arbitrary for a valid name segment (lowercase alphanumeric, non-empty) */
export const validNameSegment = fc.string({
  unit: fc.mapToConstant(
    { num: 26, build: (v) => String.fromCharCode(97 + v) }, // a-z
    { num: 10, build: (v) => String.fromCharCode(48 + v) }, // 0-9
  ),
  minLength: 1,
  maxLength: 8,
});

/** Arbitrary for a valid name matching /^[a-z0-9]+(-[a-z0-9]+)*$/ */
export const validName = fc
  .array(validNameSegment, { minLength: 1, maxLength: 3 })
  .map((parts) => parts.join("-"));
