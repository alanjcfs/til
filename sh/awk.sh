# List all docker containers, print sixth column, and docker delete
docker ps -a | awk '{ FS=" {3,}" } { print $6 }' | xargs docker rm -f
