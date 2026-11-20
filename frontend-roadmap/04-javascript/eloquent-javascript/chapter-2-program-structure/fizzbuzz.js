/*
A program that prints "Fizz" for numbers divided by 3 
and "Buzz" for numbers divided by 5
and then "FizzBuzz" for numbers divided by 15
for numbers 1 to 100
*/

let maxNum = 100;

// for (let counter =0; counter <= maxNum; counter++){
//     if (counter %3 == 0 && counter % 5 ==0) {
//         console.log("FizzBuzz");
//     } else if (counter %3==0){
//         console.log("Fizz");
//     } else if (counter %5==0){
//         console.log("Buzz");
//     } else{
//         console.log(counter)
//     }
// }


for (let counter =0; counter <=maxNum; counter++){
    let output="";
    if (counter %3==0){ output +="Fizz"};
    if (counter %5==0){ output +="Buzz"};
    console.log(output || counter)
}