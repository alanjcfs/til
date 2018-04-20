# To remove a line from all the files in a directory
# (Mac focused)
find . -type f -exec grep -Iq . {} \; -exec sed -i '' '/document.*ready/d' {} \;
# find in current directory all files using grep to exclude binary using sed to delete lines and save in place using -i ''

# To substitute
find . -type f -exec grep -Iq . {} \; -exec sed -i '' 's/document.*ready/document.addEventListener/g' {} \;

# Linux might not need the -i flag.

