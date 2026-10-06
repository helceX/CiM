-- Feed titles that arrive HTML-encoded inside CDATA (TÜİK&apos;in, &#8217;) were
-- stored literally and shown with the entity text. New articles are decoded at
-- ingest (packages/ingestion feed-parse); this repairs the rows already stored.
CREATE FUNCTION decode_html_entities_tmp(input text) RETURNS text AS $$
DECLARE
  result text := input;
  m text[];
  cp integer;
BEGIN
  IF result IS NULL OR position('&' in result) = 0 THEN
    RETURN result;
  END IF;
  LOOP
    m := regexp_match(result, '&#([0-9]{1,7});');
    EXIT WHEN m IS NULL;
    cp := m[1]::integer;
    IF cp BETWEEN 32 AND 1114111 AND cp NOT BETWEEN 55296 AND 57343 THEN
      result := replace(result, '&#' || m[1] || ';', chr(cp));
    ELSE
      result := replace(result, '&#' || m[1] || ';', ' ');
    END IF;
  END LOOP;
  LOOP
    m := regexp_match(result, '&#[xX]([0-9a-fA-F]{1,6});');
    EXIT WHEN m IS NULL;
    cp := ('x' || lpad(m[1], 8, '0'))::bit(32)::integer;
    IF cp BETWEEN 32 AND 1114111 AND cp NOT BETWEEN 55296 AND 57343 THEN
      result := regexp_replace(result, '&#[xX]' || m[1] || ';', chr(cp), 'g');
    ELSE
      result := regexp_replace(result, '&#[xX]' || m[1] || ';', ' ', 'g');
    END IF;
  END LOOP;
  result := replace(result, '&apos;', '''');
  result := replace(result, '&quot;', '"');
  result := replace(result, '&lt;', '<');
  result := replace(result, '&gt;', '>');
  result := replace(result, '&nbsp;', ' ');
  result := replace(result, '&mdash;', '—');
  result := replace(result, '&ndash;', '–');
  result := replace(result, '&hellip;', '…');
  result := replace(result, '&rsquo;', '’');
  result := replace(result, '&lsquo;', '‘');
  result := replace(result, '&rdquo;', '”');
  result := replace(result, '&ldquo;', '“');
  result := replace(result, '&amp;', '&');
  RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
--> statement-breakpoint
UPDATE "articles"
SET "title" = decode_html_entities_tmp("title"),
    "stored_excerpt" = decode_html_entities_tmp("stored_excerpt"),
    "author_name" = decode_html_entities_tmp("author_name")
WHERE "title" ~ '&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z]+);'
   OR "stored_excerpt" ~ '&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z]+);'
   OR "author_name" ~ '&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z]+);';
--> statement-breakpoint
DROP FUNCTION decode_html_entities_tmp(text);
