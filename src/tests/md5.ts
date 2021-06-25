/* GL -- 8/03/2017
Testing file checksums and string checksums
Be carefull trailer "\n" in the last line of file are automatically added
when you echo "toto" > myFile.txt
see:
https://stackoverflow.com/questions/41751690/why-md5-hash-of-a-word-from-a-file-doesnt-match-the-hash-of-a-string
*/

import md5 = require('md5')

console.log(md5('blah blah blah\n'));

let fs = require('fs');


fs.readFile('data/file.txt', function(err : any, buf : any) {
  console.log(md5(buf));
});

fs.readFile('data/file2.txt', function(err : any, buf : any) {
  console.log(md5(buf));
});
