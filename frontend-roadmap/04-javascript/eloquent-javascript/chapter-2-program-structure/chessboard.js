/*

a program to create an 8x8 grid using newline characters to separate lines,
at each position there is either a space or a character "#"
characters should form a chessboard.

*/


let size = prompt("what should the size of the chessboard be?");

size = Number(size);

let board ="";

for (let row = 0; row<=size; row++){
    for (let col=0; col<=size; col++){
        if ((row+col) %2 ==0){
            board += " "
        } else {
            board +="#"
        }
    }
    board += "\n"

}

console.log(board)