#!/bin/bash

# a simple bash script to create a JSON from reversing the $input file

sleep 5 # to have the time to watch the job in the queue
contentInput=`cat $input`
echo -n "{"

if [ ${#contentInput} -gt 2 ] # IF length of $contentInput > 2
then
       contentInput=`echo $contentInput | sed s/'"'/''/g`
       echo -n "\"reverse\":\""
       echo -n `echo $contentInput | rev`
       echo -n "\""
fi

echo -n "}"
