# This is a simple script to test local mode of jobManager
# waitingTime variable should be set by local default jobProfile


if [ -z ${waitingTime+x} ]; then echo "waitingTime should be set";waitingTime=5; else echo "waitingTime is all set"; fi


echo "local test start for ${waitingTime}sc"
sleep $waitingTime
echo "local test end"

if [ -z ${jobID+x} ]; then echo "No jobID"; else echo "jobID is $jobID"; fi
