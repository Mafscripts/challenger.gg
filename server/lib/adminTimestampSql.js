import { Prisma } from "@prisma/client";

// Legacy metadata is text, so even a timestamp-shaped value may contain an
// impossible day or an invalid timezone. Guard every cast in nested CASEs;
// PostgreSQL is free to reorder ordinary AND conditions.
export function adminTimestampSql(value) {
  return Prisma.sql`CASE WHEN ${value} ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])([Tt ]([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]([.][0-9]{1,9})?([Zz]|[+-](0[0-9]|1[0-5])([:]?[0-5][0-9])?)?)?$'
    THEN CASE WHEN substring(${value}, 1, 4)::int BETWEEN 1 AND 9999
      THEN CASE WHEN substring(${value}, 9, 2)::int <= extract(day FROM
        (make_date(substring(${value}, 1, 4)::int, substring(${value}, 6, 2)::int, 1) + interval '1 month - 1 day'))
        THEN (${value})::timestamptz END
      END
    END`;
}
