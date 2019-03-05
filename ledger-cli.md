Show income in January:

    ledger -f file -b "January" -S T bal ^income

Show expense in February:

    ledger -f file -b "February" -S T bal ^expenses

Show expenses reports sorted by amount divided by month

    ledger -f file -M --period-sort "(amount)" reg ^exp

Show liability reports sorted by amount divided by month

    ledger -f file -M --period-sort "(amount)" reg ^liab
