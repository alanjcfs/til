-- Date: 2023-12-03
-- Author: Chris Kearns
-- True Author: Alan Fung-Schwarz
-- Purpose: Return the last day of the previous month in the America/New_York timezone.
-- It truncates the current datetime to the month, subtracts 1 day, indicates
-- the time zone is New York, and then coerces it to display tz information,
-- which will be in your local time zone.

-- My time zone is currently -8, ergo
-- Best Coast: 2023-11-30 03:00:00-08
-- East Coast: 2023-11-30 00:00:00-05
-- Across the Pond: 2023-11-30 08:00:00+00

SELECT (
	(
		date_trunc(
			'month',
			now()) - interval '1 day'
		) at time zone 'America/New_York'
	)::timestamptz;
