/* Rust try!, now renamed to using `?` at the end is an idiom that must be used in a function that
 * returns Result. This means that `?` *cannot* be used in `main`.
 */

use std::fs::File;
use std::io::Error;

fn foo_result(s: &str) -> Result<File, Error> {
    let file = File::open(s)?;
    Ok(file)
}

fn print_result(obj: Result<File, Error>) {
    match obj {
        Ok(file) => println!("Everything was all right: {:?}", file),
        Err(_) => println!("Something went wrong")
    }
}

fn main() {
    let foo = foo_result("nonexistent.txt");
    let bar = foo_result("yaml_rust.rs");

    println!("We expect opening nonexistent file to say something went wrong");
    print_result(foo);
    println!("We expect opening yaml_rust.rs to say everything was all right");
    print_result(bar);
}
