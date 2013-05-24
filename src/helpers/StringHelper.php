<?php
namespace Craft;

/**
 *
 */
class StringHelper
{
	private static $_asciiCharMap;
	private static $_asciiPunctuation;

	/**
	 * Converts an array to a string.
	 *
	 * @static
	 * @param mixed  $arr
	 * @param string $glue
	 * @return string
	 */
	public static function arrayToString($arr, $glue = ',')
	{
		if (is_array($arr) || $arr instanceof \IteratorAggregate)
		{
			$stringValues = array();

			foreach ($arr as $value)
			{
				$stringValues[] = static::arrayToString($value, $glue);
			}

			return implode($glue, $stringValues);
		}
		else
		{
			return (string) $arr;
		}
	}

	/**
	 * @static
	 * @param $value
	 * @return bool
	 * @throws Exception
	 */
	public static function isNullOrEmpty($value)
	{
		if ($value === null || $value === '')
		{
			return true;
		}

		if (!is_string($value))
		{
			throw new Exception(Craft::t('IsNullOrEmpty requires a string.'));
		}

		return false;
	}

	/**
	 * @static
	 * @param $value
	 * @return bool
	 * @throws Exception
	 */
	public static function isNotNullOrEmpty($value)
	{
		return !static::isNullOrEmpty($value);
	}

	/**
	 * @static
	 * @param int  $length
	 * @param bool $extendedChars
	 * @return string
	 */
	public static function randomString($length = 36, $extendedChars = false)
	{
		if ($extendedChars)
		{
			$validChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890`~!@#$%^&*()-_=+[]\{}|;:\'",./<>?"';
		}
		else
		{
			$validChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';
		}

		$randomString = '';

		// count the number of chars in the valid chars string so we know how many choices we have
		$numValidChars = strlen($validChars);

		// repeat the steps until we've created a string of the right length
		for ($i = 0; $i < $length; $i++)
		{
			// pick a random number from 1 up to the number of valid chars
			$randomPick = mt_rand(1, $numValidChars);

			// take the random character out of the string of valid chars
			$randomChar = $validChars[$randomPick - 1];

			// add the randomly-chosen char onto the end of our string
			$randomString .= $randomChar;
		}

		return $randomString;
	}

	/**
	 * @static
	 * @return string
	 */
	public static function UUID()
	{
		return sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',

			// 32 bits for "time_low"
			mt_rand(0, 0xffff), mt_rand(0, 0xffff),

			// 16 bits for "time_mid"
			mt_rand(0, 0xffff),

			// 16 bits for "time_hi_and_version", four most significant bits holds version number 4
			mt_rand(0, 0x0fff) | 0x4000,

			// 16 bits, 8 bits for "clk_seq_hi_res", 8 bits for "clk_seq_low",
			// two most significant bits holds zero and one for variant DCE1.1
			mt_rand(0, 0x3fff) | 0x8000,

			// 48 bits for "node"
			mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
		);
	}

	/**
	 * Returns is the given string matches a UUID pattern.
	 *
	 * @param $uuid
	 * @return bool
	 */
	public static function isUUID($uuid)
	{
		return !empty($uuid) && preg_match("/[A-Z0-9]{8}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{12}/uis", $uuid);
	}

	/**
	 * @static
	 * @param $string
	 * @return mixed
	 */
	public static function escapeRegexChars($string)
	{
		$charsToEscape = str_split("\\/^$.,{}[]()|<>:*+-=");
		$escapedChars = array();

		foreach ($charsToEscape as $char)
		{
			$escapedChars[] = "\\".$char;
		}

		return  str_replace($charsToEscape, $escapedChars, $string);
	}

	/**
	 * Returns ASCII character mappings.
	 *
	 * @static
	 * @return array
	 */
	public static function getAsciiCharMap()
	{
		if (!isset(static::$_asciiCharMap))
		{
			static::$_asciiCharMap = array(
				223 => 'ss', 224 => 'a',  225 => 'a',  226 => 'a',  229 => 'a',
				227 => 'ae', 230 => 'ae', 228 => 'ae', 231 => 'c',  232 => 'e',
				233 => 'e',  234 => 'e',  235 => 'e',  236 => 'i',  237 => 'i',
				238 => 'i',  239 => 'i',  241 => 'n',  242 => 'o',  243 => 'o',
				244 => 'o',  245 => 'o',  246 => 'oe', 249 => 'u',  250 => 'u',
				251 => 'u',  252 => 'ue', 255 => 'y',  257 => 'aa', 269 => 'ch',
				275 => 'ee', 291 => 'gj', 299 => 'ii', 311 => 'kj', 316 => 'lj',
				326 => 'nj', 353 => 'sh', 363 => 'uu', 382 => 'zh', 256 => 'aa',
				268 => 'ch', 274 => 'ee', 290 => 'gj', 298 => 'ii', 310 => 'kj',
				315 => 'lj', 325 => 'nj', 352 => 'sh', 362 => 'uu', 381 => 'zh'
			);

			foreach (craft()->config->get('customAsciiCharMappings') as $ascii => $char)
			{
				static::$_asciiCharMap[$ascii] = $char;
			}
		}

		return static::$_asciiCharMap;
	}

	/**
	 * Returns the asciiPunctuation array.
	 *
	 * @static
	 * @return array
	 */
	public static function getAsciiPunctuation()
	{
		if (!isset(static::$_asciiPunctuation))
		{
			static::$_asciiPunctuation =  array(
				33, 34, 35, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 58, 59, 60, 62, 63,
				64, 91, 92, 93, 94, 123, 124, 125, 126, 161, 162, 163, 164, 165, 166,
				167, 168, 169, 170, 171, 172, 174, 175, 176, 177, 178, 179, 180, 181,
				182, 183, 184, 185, 186, 187, 188, 189, 190, 191, 215, 402, 710, 732,
				8211, 8212, 8213, 8216, 8217, 8218, 8220, 8221, 8222, 8224, 8225, 8226,
				8227, 8230, 8240, 8242, 8243, 8249, 8250, 8252, 8254, 8260, 8364, 8482,
				8592, 8593, 8594, 8595, 8596, 8629, 8656, 8657, 8658, 8659, 8660, 8704,
				8706, 8707, 8709, 8711, 8712, 8713, 8715, 8719, 8721, 8722, 8727, 8730,
				8733, 8734, 8736, 8743, 8744, 8745, 8746, 8747, 8756, 8764, 8773, 8776,
				8800, 8801, 8804, 8805, 8834, 8835, 8836, 8838, 8839, 8853, 8855, 8869,
				8901, 8968, 8969, 8970, 8971, 9001, 9002, 9674, 9824, 9827, 9829, 9830
			);
		}

		return static::$_asciiPunctuation;
	}

	/**
	 * Converts extended ASCII characters to ASCII.
	 *
	 * @static
	 * @param string $str
	 * @return string
	 */
	public static function asciiString($str)
	{
		$asciiStr = '';
		$strlen = strlen($str);
		$asciiCharMap = static::getAsciiCharMap();

		for ($c = 0; $c < $strlen; $c++)
		{
			$char = $str[$c];
			$ascii = ord($char);

			if ($ascii >= 32 && $ascii < 128)
			{
				$asciiStr .= $char;
			}
			else if (isset($asciiCharMap[$ascii]))
			{
				$asciiStr .= $asciiCharMap[$ascii];
			}
		}

		return $asciiStr;
	}

	/**
	 * Normalizes search keywords.
	 *
	 * @access private
	 * @param string  $str The dirty keywords.
	 * @param array  $ignore Ignore words to strip out.
	 * @return string The cleansed keywords.
	 */
	public static function normalizeKeywords($str, $ignore = array())
	{
		// Flatten
		if (is_array($str)) $str = static::arrayToString($str, ' ');

		// Get rid of tags
		$str = strip_tags($str);

		// Convert non-breaking spaces entities to regular ones
		$str = str_replace(array('&nbsp;', '&#160;', '&#xa0;') , ' ', $str);

		// Get rid of entities
		$str = html_entity_decode($str, ENT_QUOTES, 'UTF-8');

		// Remove punctuation and diacritics
		$str = strtr($str, static::_getCharMap());

		// Normalize to lowercase
		$str = function_exists('mb_strtolower') ? mb_strtolower($str, 'UTF-8') : strtolower($str);

		// Remove ignore-words?
		if (is_array($ignore) && ! empty($ignore))
		{
			foreach ($ignore as $word)
			{
				$word = preg_quote(static::_normalizeKeywords($word));
				$str  = preg_replace("/\b{$word}\b/", '', $str);
			}
		}

		// Strip out new lines and superfluous spaces
		$str = preg_replace('/[\n\r]+/', ' ', $str);
		$str = preg_replace('/\s{2,}/', ' ', $str);

		// Trim white space
		$str = trim($str);

		return $str;
	}

	/**
	 * Get array of chars to be used for conversion.
	 *
	 * @access private
	 * @return array
	 */
	private static function _getCharMap()
	{
		// Keep local copy
		static $map = array();

		if (empty($map))
		{
			// This will replace accented chars with non-accented chars
			foreach (static::getAsciiCharMap() AS $k => $v)
			{
				$map[static::_chr($k)] = $v;
			}

			// Replace punctuation with a space
			foreach (static::getAsciiPunctuation() AS $i)
			{
				$map[static::_chr($i)] = ' ';
			}
		}

		// Return the char map
		return $map;
	}

	/**
	 * Custom alternative to chr().
	 *
	 * @static
	 * @param int $int
	 * @return string
	 */
	private static function _chr($int)
	{
		return html_entity_decode("&#{$int};", ENT_QUOTES, 'UTF-8');
	}
}
