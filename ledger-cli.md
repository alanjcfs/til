Show income beginning in January with no end date:

    ledger -f file -b "January" -S T bal ^income

Show expense for February:

    `-b` means `--beginning` and `-e` means `--end`
    ledger -f file -b "February" -e "March" -S T bal ^expenses

Show expenses reports sorted by amount divided by month

    ledger -f file -M --period-sort "(amount)" reg ^exp

Show liability reports sorted by amount divided by month

    ledger -f file -M --period-sort "(amount)" reg ^liab

Sort by date

    ledger -f file -S date reg Checking

Convert CSV to a Ledger Format

    ledger -f file convert CreditCard3.csv --input-date-format "%m/%d/%Y" --invert --account Assets:Savings --rich-data --auto-match

Use `>> file` to import directly
