# How to allocate without calling initialize
class Foo
  UnpermittedSubclassInstantiationError = Class.new(StandardError)

  class << self
    def new(*args, &blk)
      fail UnpermittedSubclassInstantiationError, 'cannot instantiate subclasses' if self < Foo

      subclass_allocation = allocate.tap do |subclass_instance|
        subclass_instance.send(:initialize, *args, &blk)
      end

      allocate.tap do |instance_of_foo|
        instance_of_foo.instance_variable_set(:@allocation, subclass_allocation)
      end
    end
  end

  module Initialization
    def initialize(*args)
      @args = args
    end
  end

  def call
    @allocation.call
  end
end

class FooSubclass < Foo
  prepend Initialization
end

# subclass = FooSubclass.new => UnpermittedSubclassInstantiationError
