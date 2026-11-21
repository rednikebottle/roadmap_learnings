/*
write a function like math.min that returns its smallest arguement, 
the function min takes in two arguements and returns the minumum
*/

// const min = function(a,b) {
//     if (a<b){
//         return a;
//     }else {
//         return b;
//     }

// }

function min(a,b){
    if (a<b){
        return a;
    }else {
        return b;
    }
}

// let min = (a,b) => {
//     if (a<b){
//         return a;
//     }else {
//         return b;
//     }
// }

console.log(min(5,7));